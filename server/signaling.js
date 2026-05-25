// WebSocket signaling server + static file server for WebRTC handshake
// Uses only Node.js built-in modules
// Usage: node server/signaling.js [port]
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.argv[2]) || 8088;
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CLEANUP_INTERVAL = 60_000;
const ROOM_MAX_AGE = 10 * 60_000;

// --- Minimal WebSocket frame handling ---
function encodeFrame(data) {
  const payload = Buffer.from(data, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function parseFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;
    const opcode = buffer[offset] & 0x0f;
    const masked = (buffer[offset + 1] & 0x80) !== 0;
    let payloadLen = buffer[offset + 1] & 0x7f;
    let headerLen = 2;
    if (payloadLen === 126) {
      if (buffer.length - offset < 4) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (buffer.length - offset < 10) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (buffer.length - offset < headerLen + maskLen + payloadLen) break;
    const maskKey = masked ? buffer.slice(offset + headerLen, offset + headerLen + 4) : null;
    const payloadStart = offset + headerLen + maskLen;
    const payload = buffer.slice(payloadStart, payloadStart + payloadLen);
    if (masked) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
    }
    if (opcode === 0x8) {
      frames.push({ type: 'close' });
    } else if (opcode === 0x9) {
      frames.push({ type: 'ping', payload });
    } else if (opcode === 0xA) {
      frames.push({ type: 'pong', payload });
    } else {
      frames.push({ type: 'text', payload: payload.toString('utf8') });
    }
    offset = payloadStart + payloadLen;
  }
  return { frames, consumed: offset };
}

// --- Room management ---
const rooms = new Map(); // roomCode -> { host: socket, peer: socket|null, createdAt: number }

function generateRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

function cleanupRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_MAX_AGE && !room.peer) {
      safeClose(room.host);
      rooms.delete(code);
    }
  }
}

// --- Connection state per socket ---
const sockets = new WeakMap(); // socket -> { roomCode, role: 'host'|'peer', buffer }

function send(socket, data) {
  if (socket.readyState !== 'open') return;
  try { socket.write(encodeFrame(JSON.stringify(data))); } catch (_) { /* ignore */ }
}

function safeClose(socket) {
  try { socket.destroy(); } catch (_) { /* ignore */ }
}

function handleMessage(socket, msg) {
  let data;
  try { data = JSON.parse(msg); } catch (_) { return; }
  const conn = sockets.get(socket);

  switch (data.type) {
    case 'CREATE_ROOM': {
      const code = generateRoomCode();
      rooms.set(code, { host: socket, peer: null, createdAt: Date.now() });
      sockets.set(socket, { roomCode: code, role: 'host', buffer: Buffer.alloc(0) });
      send(socket, { type: 'ROOM_CREATED', roomCode: code });
      console.log(`[room] ${code} created`);
      break;
    }
    case 'JOIN_ROOM': {
      const room = rooms.get(data.roomCode);
      if (!room) {
        send(socket, { type: 'JOIN_ERROR', reason: 'room_not_found' });
        return;
      }
      if (room.peer) {
        send(socket, { type: 'JOIN_ERROR', reason: 'room_full' });
        return;
      }
      room.peer = socket;
      sockets.set(socket, { roomCode: data.roomCode, role: 'peer', buffer: Buffer.alloc(0) });
      send(room.host, { type: 'PEER_JOINED' });
      send(socket, { type: 'JOIN_SUCCESS', playerId: 'player2' });
      console.log(`[room] ${data.roomCode} joined`);
      break;
    }
    case 'RELAY': {
      if (!conn) return;
      const room = rooms.get(conn.roomCode);
      if (!room) return;
      const target = conn.role === 'host' ? room.peer : room.host;
      if (target) send(target, { type: 'RELAY', from: conn.role, payload: data.payload });
      break;
    }
    case 'PING':
      send(socket, { type: 'PONG' });
      break;
  }
}

function onSocketClose(socket) {
  const conn = sockets.get(socket);
  if (!conn) return;
  const room = rooms.get(conn.roomCode);
  if (!room) return;
  const other = conn.role === 'host' ? room.peer : room.host;
  if (other) {
    send(other, { type: 'PEER_DISCONNECTED' });
    const otherConn = sockets.get(other);
    if (otherConn) sockets.set(other, { ...otherConn, buffer: Buffer.alloc(0) });
  }
  rooms.delete(conn.roomCode);
  sockets.delete(socket);
  console.log(`[room] ${conn.roomCode} closed (${conn.role} left)`);
}

// --- HTTP server with WebSocket upgrade ---
const ROOT = path.resolve(import.meta.dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  sockets.set(socket, { roomCode: null, role: null, buffer: Buffer.alloc(0) });

  socket.on('data', (chunk) => {
    const conn = sockets.get(socket);
    if (!conn) return;
    conn.buffer = Buffer.concat([conn.buffer, chunk]);

    while (true) {
      const { frames, consumed } = parseFrames(conn.buffer);
      if (frames.length === 0) break;
      conn.buffer = conn.buffer.slice(consumed);
      for (const frame of frames) {
        if (frame.type === 'close') { safeClose(socket); return; }
        if (frame.type === 'text') handleMessage(socket, frame.payload);
        if (frame.type === 'pong') { /* heartbeat response, no-op */ }
      }
    }
  });

  socket.on('close', () => onSocketClose(socket));
  socket.on('error', () => safeClose(socket));
});

setInterval(cleanupRooms, ROOM_CLEANUP_INTERVAL);

server.listen(PORT, () => {
  console.log(`Signaling server listening on ws://localhost:${PORT}`);
});

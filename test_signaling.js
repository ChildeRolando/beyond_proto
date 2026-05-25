// Signaling server test — uses only Node.js built-in modules
import http from 'http';
import crypto from 'crypto';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const HOST = 'localhost', PORT = 8088;
let passed = 0, failed = 0;

function check(name, condition) {
  if (condition) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31m✗\x1b[0m ${name}`); }
}

function encodeMaskedFrame(data) {
  const payload = Buffer.from(data, 'utf8');
  const len = payload.length;
  const maskKey = crypto.randomBytes(4);
  let header;
  if (len < 126) { header = Buffer.alloc(6); header[0] = 0x81; header[1] = 0x80 | len; header[2] = maskKey[0]; header[3] = maskKey[1]; header[4] = maskKey[2]; header[5] = maskKey[3]; }
  else if (len < 65536) { header = Buffer.alloc(8); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); header[4] = maskKey[0]; header[5] = maskKey[1]; header[6] = maskKey[2]; header[7] = maskKey[3]; }
  else { throw new Error('payload too large'); }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ maskKey[i % 4];
  return Buffer.concat([header, masked]);
}

function parseFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;
    const opcode = buffer[offset] & 0x0f, masked = (buffer[offset + 1] & 0x80) !== 0;
    let payloadLen = buffer[offset + 1] & 0x7f, headerLen = 2;
    if (payloadLen === 126) { if (buffer.length - offset < 4) break; payloadLen = buffer.readUInt16BE(offset + 2); headerLen = 4; }
    else if (payloadLen === 127) { if (buffer.length - offset < 10) break; payloadLen = Number(buffer.readBigUInt64BE(offset + 2)); headerLen = 10; }
    const maskLen = masked ? 4 : 0;
    if (buffer.length - offset < headerLen + maskLen + payloadLen) break;
    const maskKey = masked ? buffer.slice(offset + headerLen, offset + headerLen + 4) : null;
    const payloadStart = offset + headerLen + maskLen;
    const payload = buffer.slice(payloadStart, payloadStart + payloadLen);
    if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
    if (opcode === 0x8) frames.push({ type: 'close' });
    else if (opcode === 0xA) frames.push({ type: 'pong' });
    else frames.push({ type: 'text', payload: payload.toString('utf8') });
    offset = payloadStart + payloadLen;
  }
  return { frames, consumed: offset };
}

async function wsConnect() {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, method: 'GET', path: '/', headers: { 'Upgrade': 'websocket', 'Connection': 'Upgrade', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13' } });
    req.on('upgrade', (res, socket, head) => {
      const buffer = { buf: head?.length ? Buffer.from(head) : Buffer.alloc(0) };
      socket.on('data', chunk => { buffer.buf = Buffer.concat([buffer.buf, chunk]); });
      resolve({ socket, buffer });
    });
    req.on('error', reject);
    req.end();
    setTimeout(() => reject(new Error('connect timeout')), 4000);
  });
}

function send(conn, data) { conn.socket.write(encodeMaskedFrame(JSON.stringify(data))); }

// Wait for messages, return parsed JSON objects
async function waitMessages(conn, delayMs = 300) {
  await new Promise(r => setTimeout(r, delayMs));
  const { frames, consumed } = parseFrames(conn.buffer.buf);
  conn.buffer.buf = conn.buffer.buf.slice(consumed);
  return frames
    .filter(f => f.type === 'text' || f.type === 'pong')
    .map(f => f.type === 'pong' ? { type: 'PONG' } : JSON.parse(f.payload));
}

async function test() {
  console.log('=== Signaling Server Test ===\n');

  // Test 1: Create room
  console.log('[1] CREATE_ROOM');
  const host = await wsConnect();
  send(host, { type: 'CREATE_ROOM' });
  let msgs = await waitMessages(host);
  check('Receives ROOM_CREATED', msgs.some(m => m.type === 'ROOM_CREATED'));
  const roomMsg = msgs.find(m => m.type === 'ROOM_CREATED');
  check('Has 4-char roomCode', roomMsg?.roomCode?.length === 4);
  const roomCode = roomMsg?.roomCode;
  console.log(`    roomCode: ${roomCode}`);

  // Test 2: Join invalid room
  console.log('[2] JOIN_ROOM (invalid code)');
  const badClient = await wsConnect();
  send(badClient, { type: 'JOIN_ROOM', roomCode: 'XXXX' });
  msgs = await waitMessages(badClient);
  check('JOIN_ERROR for invalid room', msgs.some(m => m.type === 'JOIN_ERROR' && m.reason === 'room_not_found'));
  badClient.socket.destroy();

  // Test 3: Join valid room
  console.log('[3] JOIN_ROOM (valid code)');
  const client = await wsConnect();
  send(client, { type: 'JOIN_ROOM', roomCode });
  const clientMsgs = await waitMessages(client);
  check('Client gets JOIN_SUCCESS', clientMsgs.some(m => m.type === 'JOIN_SUCCESS'));
  check('Client is player2', clientMsgs.some(m => m.type === 'JOIN_SUCCESS' && m.playerId === 'player2'));
  const hostMsgs = await waitMessages(host);
  check('Host gets PEER_JOINED', hostMsgs.some(m => m.type === 'PEER_JOINED'));

  // Test 4: Room full
  console.log('[4] JOIN_ROOM (room full)');
  const third = await wsConnect();
  send(third, { type: 'JOIN_ROOM', roomCode });
  msgs = await waitMessages(third);
  check('Third client gets room_full', msgs.some(m => m.type === 'JOIN_ERROR' && m.reason === 'room_full'));
  third.socket.destroy();

  // Test 5: RELAY messages
  console.log('[5] RELAY messages');
  send(host, { type: 'RELAY', payload: { type: 'offer', sdp: 'test-offer' } });
  msgs = await waitMessages(client);
  check('Client receives relayed offer', msgs.some(m => m.type === 'RELAY' && m.payload?.type === 'offer'));

  send(client, { type: 'RELAY', payload: { type: 'answer', sdp: 'test-answer' } });
  msgs = await waitMessages(host);
  check('Host receives relayed answer', msgs.some(m => m.type === 'RELAY' && m.payload?.type === 'answer'));

  send(host, { type: 'RELAY', payload: { type: 'ice', candidate: { candidate: 'test' } } });
  msgs = await waitMessages(client);
  check('Client receives ICE candidate', msgs.some(m => m.type === 'RELAY' && m.payload?.type === 'ice'));

  // Test 6: PING/PONG
  console.log('[6] PING/PONG');
  send(host, { type: 'PING' });
  msgs = await waitMessages(host);
  check('Host receives PONG', msgs.some(m => m.type === 'PONG'));

  // Test 7: Disconnect propagation (via proper WebSocket close frame)
  console.log('[7] Disconnect propagation');
  // Send close frame (opcode 0x8, masked) — mimics browser ws.close()
  const closeMaskKey = crypto.randomBytes(4);
  const closeHeader = Buffer.alloc(6);
  closeHeader[0] = 0x88; closeHeader[1] = 0x80;
  closeHeader[2] = closeMaskKey[0]; closeHeader[3] = closeMaskKey[1]; closeHeader[4] = closeMaskKey[2]; closeHeader[5] = closeMaskKey[3];
  client.socket.write(closeHeader);
  msgs = await waitMessages(host, 500);
  check('Host receives PEER_DISCONNECTED when client leaves', msgs.some(m => m.type === 'PEER_DISCONNECTED'));

  host.socket.destroy();

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

test().catch(e => { console.error('Test error:', e.message); process.exit(1); });

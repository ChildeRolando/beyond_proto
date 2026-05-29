// Minimal static file server — serves the combat-engine directory
// Usage: node server/static.js [port]
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.argv[2]) || 3000;
const ROOT = path.resolve(import.meta.dirname, '..');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

const CACHE_IMMUTABLE = { 'Cache-Control': 'public, max-age=31536000, immutable' };

http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.png' || ext === '.webp' || ext === '.jpg' || ext === '.svg' || ext === '.woff2' || ext === '.ttf') {
      Object.assign(headers, CACHE_IMMUTABLE);
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Game server listening on http://localhost:${PORT}`);
});

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8765;
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(root, relative);
  if (filename !== root && !filename.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filename, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.setHeader('Content-Type', types[path.extname(filename).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    const stream = fs.createReadStream(filename);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end('Read error');
    });
    stream.pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`WFM What If running at http://127.0.0.1:${port}/`);
});

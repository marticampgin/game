import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createRooms, RoomError } from './rooms.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

async function readInput(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw new RoomError(413, 'Request exceeds the room message limit.');
    chunks.push(chunk);
  }
  if (!size) return {};
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RoomError(400, 'Send a JSON object.');
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new RoomError(400, 'Send a JSON object.');
  return data;
}

function json(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

async function staticFile(pathname, request, response) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    throw new RoomError(400, 'Invalid file path.');
  }
  if (/[\\:\0]/.test(path) || path.split('/').some(part => part.startsWith('.'))) throw new RoomError(404, 'File not found.');
  const isSource = path.startsWith('/src/');
  const root = resolve(projectRoot, isSource ? 'src' : 'public');
  const route = isSource ? path.slice(5) : path.slice(1);
  const file = resolve(root, route || 'index.html');
  if (!file.startsWith(root + sep)) throw new RoomError(404, 'File not found.');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new RoomError(404, 'File not found.');
  response.writeHead(200, {
    'Content-Type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') response.end();
  else await pipeline(createReadStream(file), response);
}

export function createArenaServer(options) {
  const rooms = createRooms(options);
  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (!pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) throw new RoomError(405, 'Method not supported.');
        await staticFile(pathname, request, response);
        return;
      }
      if (pathname === '/api/rooms' && request.method === 'POST') {
        json(response, 201, rooms.create(await readInput(request)));
        return;
      }
      const route = /^\/api\/rooms\/([a-z2-9]{6})(?:\/(join|class|start|command|leave))?$/i.exec(pathname);
      if (!route) throw new RoomError(404, 'Room endpoint not found.');
      const [, code, operation = 'view'] = route;
      if (request.method !== (operation === 'view' ? 'GET' : 'POST')) throw new RoomError(405, 'Method not supported.');
      const input = operation === 'view' ? {} : await readInput(request);
      if (operation === 'join') json(response, 201, rooms.join(code, input));
      else {
        const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.authorization ?? '')?.[1];
        json(response, 200, rooms.interact(code, token, operation, input));
      }
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      if (!(error instanceof RoomError)) console.error('Arena request failed', error);
      json(response, error instanceof RoomError ? error.status : 500, {
        error: error instanceof RoomError ? error.message : 'The server could not complete this request.',
      });
    }
  });
  server.on('close', () => rooms.close());
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  createArenaServer().listen(port, host, () => {
    console.log('Arena running on http://' + host + ':' + port);
  });
}

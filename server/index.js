import { createServer } from 'node:http';
import { open } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createProfiles, profileKey, ProfileError } from './profiles.js';
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
  // A rebuild can atomically replace this path during a download. Size, tag
  // and body must describe the same open edition of the bitmap.
  const handle = await open(file).catch(() => null);
  if (!handle) throw new RoomError(404, 'File not found.');
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new RoomError(404, 'File not found.');
    // Art and modules have stable filenames. Check for a new build on return,
    // while letting an unchanged fighter sheet stay in the browser's cache.
    const tag = '"' + info.size.toString(16) + '-' + info.mtimeMs.toString(16) + '"';
    const cache = { 'Cache-Control': 'no-cache', ETag: 'W/' + tag, 'Last-Modified': info.mtime.toUTCString() };
    const suppliedTags = request.headers['if-none-match'];
    const unchanged = suppliedTags !== undefined
      ? suppliedTags.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === tag)
      : Math.floor(info.mtimeMs / 1000) * 1000 <= Date.parse(request.headers['if-modified-since']);
    if (unchanged) {
      response.writeHead(304, cache);
      response.end();
      return;
    }
    response.writeHead(200, {
      ...cache,
      'Content-Type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else await pipeline(handle.createReadStream(), response);
  } finally {
    await handle.close();
  }
}

export function createArenaServer(options) {
  const profiles = createProfiles(options);
  const rooms = createRooms({...options,profiles});
  const server = createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (!pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) throw new RoomError(405, 'Method not supported.');
        await staticFile(pathname, request, response);
        return;
      }
      const key = profileKey(request.headers['x-rift-profile']);
      if (pathname.startsWith('/api/profile')) {
        if (!key) throw new ProfileError(401,'This device needs a player profile.');
        const route = /^\/api\/profile(?:\/(buy|equip|solo)(?:\/([0-9a-f-]{36}))?)?$/.exec(pathname);
        if (!route) throw new ProfileError(404,'Unknown profile endpoint.');
        const [, operation, runId] = route;
        if (request.method !== (operation ? 'POST' : 'GET')) throw new ProfileError(405,'Method not supported.');
        if (!operation) json(response,200,profiles.view(key));
        else {
          const input=await readInput(request);
          if (operation === 'solo') json(response,runId?200:201,runId ? profiles.syncSolo(key,runId,input) : profiles.startSolo(key,input));
          else if (!runId) json(response,200,profiles.change(key,operation,input));
          else throw new ProfileError(404,'Unknown profile endpoint.');
        }
        return;
      }
      if (pathname === '/api/rooms' && request.method === 'POST') {
        json(response, 201, rooms.create(await readInput(request),key));
        return;
      }
      const route = /^\/api\/rooms\/([a-z2-9]{6})(?:\/(join|class|start|command|leave))?$/i.exec(pathname);
      if (!route) throw new RoomError(404, 'Room endpoint not found.');
      const [, code, operation = 'view'] = route;
      if (request.method !== (operation === 'view' ? 'GET' : 'POST')) throw new RoomError(405, 'Method not supported.');
      const input = operation === 'view' ? {} : await readInput(request);
      if (operation === 'join') json(response, 201, rooms.join(code, input,key));
      else {
        const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.authorization ?? '')?.[1];
        json(response, 200, rooms.interact(code, token, operation, input));
      }
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const known = error instanceof RoomError || error instanceof ProfileError;
      if (!known) console.error('Arena request failed', error);
      json(response, known ? error.status : 500, {
        error: known ? error.message : 'The server could not complete this request.',
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

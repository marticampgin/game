import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { listenForBrowser } from '../e2e/browser-server.js';

test('browser fixtures retry occupied and excluded ports within the high loopback range', async () => {
  const server = new EventEmitter();
  const failures = ['EADDRINUSE', 'EACCES'];
  let boundPort;
  server.listen = (port, host) => {
    assert.equal(host, '127.0.0.1');
    assert.ok(port >= 49152 && port <= 65535);
    const code = failures.shift();
    if (code) {
      queueMicrotask(() => server.emit('error', Object.assign(new Error(code), { code })));
    } else {
      boundPort = port;
      queueMicrotask(() => server.emit('listening'));
    }
  };
  const address = await listenForBrowser(server);
  assert.equal(address, `http://127.0.0.1:${boundPort}`);
});

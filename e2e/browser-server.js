import { randomInt } from 'node:crypto';
import { once } from 'node:events';

export async function listenForBrowser(server) {
  // On Windows the OS can assign port 2049 to listen(0). Browsers block HTTP there.
  const maxAttempts = 32;
  for (let attempt = 1; ; attempt++) {
    const port = randomInt(49152, 65536);
    try {
      server.listen(port, '127.0.0.1');
      await once(server, 'listening');
      return `http://127.0.0.1:${port}`;
    } catch (error) {
      // An occupied port or a Windows excluded port can be skipped safely.
      if (attempt === maxAttempts || !['EADDRINUSE', 'EACCES'].includes(error.code)) throw error;
    }
  }
}

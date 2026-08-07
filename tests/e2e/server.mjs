/**
 * Minimal static file server for the e2e harness — zero external deps
 * (node:http + node:fs only). Serves the repo root over an ephemeral port so
 * concurrent test-file processes never collide.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.svg':  'image/svg+xml',
};

/** Start the server on an ephemeral port. Resolves to { baseURL, close() }. */
export function startServer() {
  const server = createServer(async (req, res) => {
    try {
      // Strip query/hash, block path traversal outside ROOT.
      const urlPath = decodeURIComponent((req.url || '/').split(/[?#]/)[0]);
      let filePath = normalize(join(ROOT, urlPath));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
      if (filePath.endsWith('/') || filePath === ROOT) filePath = join(filePath, 'index.html');

      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseURL: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

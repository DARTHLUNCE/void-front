import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Dev-only: lets inspect.html POST rendered PNG sheets to packages/client/.inspect for review. */
function inspectSaver(): Plugin {
  return {
    name: 'inspect-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__inspect-save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'sheet';
        if (!/^[\w-]+$/.test(name)) {
          res.statusCode = 400;
          res.end('bad name');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = resolve(__dirname, '.inspect');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, `${name}.png`), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

/** The page and module worker must use the same simulation/snapshot module graph. */
function synchronizedWorkerReload(): Plugin {
  const shared = resolve(__dirname, '../shared/src').replace(/\\/g, '/') + '/';
  const worker = resolve(__dirname, 'src/worker.ts').replace(/\\/g, '/');
  const protocol = resolve(__dirname, 'src/protocol.ts').replace(/\\/g, '/');
  return {
    name: 'synchronized-worker-reload',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      const path = file.replace(/\\/g, '/');
      if (path.startsWith(shared) || path === worker || path === protocol) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [inspectSaver(), synchronizedWorkerReload()],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', rollupOptions: { input: { game: resolve(__dirname, 'index.html'), ships: resolve(__dirname, 'ship-test.html') } } },
});

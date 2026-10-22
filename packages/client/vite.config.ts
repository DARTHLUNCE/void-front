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

export default defineConfig({
  plugins: [inspectSaver()],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', rollupOptions: { input: { game: resolve(__dirname, 'index.html'), ships: resolve(__dirname, 'ship-test.html') } } },
});

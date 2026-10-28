import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './adapters/config.js';
import { store } from './domain/db.js';
import { registerEventRules } from './domain/wiring.js';
import { registerRoutes } from './routes/index.js';
import { seed } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The built single-page app, when it has been built (apps/web/dist). */
const webDist = path.resolve(here, '../../web/dist');

const app = Fastify({ logger: { transport: undefined, level: 'warn' } });

async function main() {
  registerEventRules();

  // One instance, one seed. Free hosting has no persistent disk, so a restart
  // is a fresh demo rather than a half-finished one.
  const existing = await store.list('role');
  if (existing.length === 0) {
    const { job } = await seed({ reset: false, publish: config.seedPublished });
    console.log(`Seeded demo data. Job ${job.id} is ${job.status}.`);
  }

  await app.register(cors, { origin: true });
  await registerRoutes(app);

  const serveWeb = fs.existsSync(path.join(webDist, 'index.html'));
  if (serveWeb) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    // Single-page app: anything that is not an API route falls back to index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(
    serveWeb
      ? `ReLaunch India on http://localhost:${config.port} (app + API, backend: ${config.backend})`
      : `ReLaunch India API on http://localhost:${config.port} (backend: ${config.backend}). Run "npm run build" to serve the app from here too.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

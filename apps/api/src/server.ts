import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config, describeAdapters } from './adapters/config.js';
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
  let existing: unknown[];
  try {
    existing = await store.list('role');
  } catch (error) {
    // A store that was explicitly switched on and cannot be reached is a
    // misconfiguration, not something to paper over by silently falling back.
    console.error(`\nCannot reach the configured store: ${config.store}.`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    console.error(`\nCheck the credentials, the region (${config.aws.region}) and the table name (${config.aws.tableName}),`);
    console.error('or remove RELAUNCH_STORE from .env to run on local JSON files instead.\n');
    process.exit(1);
  }
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
  console.log(`Adapters — ${describeAdapters()}`);
  console.log(
    serveWeb
      ? `ReLaunch India on http://localhost:${config.port} (app + API)`
      : `ReLaunch India API on http://localhost:${config.port}. Run "npm run build" to serve the app from here too.`,
  );
}

main().catch((error) => {
  console.error(`\nReLaunch India failed to start: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`Adapters — ${describeAdapters()}`);
  console.error('Remove the switches from .env to fall back to the local implementations.\n');
  process.exit(1);
});

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd().includes('apps/api') ? '../..' : '.');

/**
 * Load .env from the repository root if there is one. Values already in the
 * environment win, so a host's own variables (Render, Lambda) are never
 * overwritten by a file that happened to be deployed alongside the code.
 */
const envFile = path.join(root, '.env');
try {
  if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
    console.log(`Loaded ${path.relative(root, envFile)}`);
  }
} catch (error) {
  console.warn(`Could not read .env: ${error instanceof Error ? error.message : error}`);
}

/**
 * Each AWS service is an independent switch. Every one defaults to its local
 * implementation, so the whole journey runs with an empty .env and no AWS
 * account. Turning one on never requires turning on any other.
 */
function pick<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  console.warn(`${name}="${value}" is not one of ${allowed.join(', ')}. Using ${fallback}.`);
  return fallback;
}

export const config = {
  store: pick('RELAUNCH_STORE', ['local', 'dynamodb'] as const, 'local'),
  artifacts: pick('RELAUNCH_ARTIFACTS', ['local', 's3'] as const, 'local'),
  events: pick('RELAUNCH_EVENTS', ['local', 'eventbridge'] as const, 'local'),
  model: pick('RELAUNCH_MODEL', ['local', 'bedrock'] as const, 'local'),
  email: pick('RELAUNCH_EMAIL', ['outbox', 'ses'] as const, 'outbox'),

  dataDir: path.resolve(root, process.env.RELAUNCH_DATA_DIR ?? '.data'),
  artifactDir: path.resolve(root, process.env.RELAUNCH_ARTIFACT_DIR ?? '.artifacts'),
  port: Number(process.env.PORT ?? 4000),
  seedPublished: process.env.RELAUNCH_SEED_PUBLISHED === 'true',

  aws: {
    region: process.env.AWS_REGION ?? 'ap-south-1',
    tableName: process.env.DDB_TABLE_NAME ?? 'relaunch-india',
    bucket: process.env.S3_BUCKET ?? 'relaunch-india-artifacts',
    eventBus: process.env.EVENT_BUS_NAME ?? 'relaunch-india',
    bedrockModelId: process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    sesFrom: process.env.SES_FROM_ADDRESS ?? 'no-reply@example.in',
    /** SES sandbox only delivers to verified identities; route everything to one. */
    sesOverrideTo: process.env.SES_OVERRIDE_TO ?? '',
  },
};

/** One line at boot saying exactly which implementation is carrying each concern. */
export function describeAdapters(): string {
  const live = [
    ['store', config.store === 'dynamodb' ? `DynamoDB (${config.aws.tableName})` : 'JSON files'],
    ['artifacts', config.artifacts === 's3' ? `S3 (${config.aws.bucket})` : 'local folder'],
    ['events', config.events === 'eventbridge' ? `EventBridge (${config.aws.eventBus})` : 'in-process'],
    ['model', config.model === 'bedrock' ? `Bedrock (${config.aws.bedrockModelId})` : 'local heuristic'],
    ['email', config.email === 'ses' ? `SES (${config.aws.sesFrom})` : 'local outbox'],
  ];
  return live.map(([k, v]) => `${k}: ${v}`).join(' · ');
}

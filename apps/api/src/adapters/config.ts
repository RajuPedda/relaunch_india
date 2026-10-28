import path from 'node:path';

export type Backend = 'local' | 'aws';

const root = path.resolve(process.cwd().includes('apps/api') ? '../..' : '.');

export const config = {
  backend: (process.env.RELAUNCH_BACKEND ?? 'local') as Backend,
  dataDir: path.resolve(root, process.env.RELAUNCH_DATA_DIR ?? '.data'),
  artifactDir: path.resolve(root, process.env.RELAUNCH_ARTIFACT_DIR ?? '.artifacts'),
  port: Number(process.env.PORT ?? 4000),
  /**
   * On a hosted demo the first visitor should land on something alive, so the
   * seeded job is confirmed and published on boot. Locally it stays a draft,
   * because confirming and publishing it is step one of the demo script.
   */
  seedPublished: process.env.RELAUNCH_SEED_PUBLISHED === 'true',
  aws: {
    region: process.env.AWS_REGION ?? 'ap-south-1',
    tableName: process.env.DDB_TABLE_NAME ?? 'relaunch-india',
    bucket: process.env.S3_BUCKET ?? 'relaunch-india-artifacts',
    eventBus: process.env.EVENT_BUS_NAME ?? 'relaunch-india',
    bedrockModelId: process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    sesFrom: process.env.SES_FROM_ADDRESS ?? 'no-reply@example.in',
    whatsappPhoneNumberId: process.env.EUM_SOCIAL_PHONE_NUMBER_ID ?? '',
  },
};

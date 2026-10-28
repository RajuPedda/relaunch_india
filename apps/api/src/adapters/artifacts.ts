import fs from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from './config.js';

/**
 * Work artifacts live in object storage. Records hold the pointer this returns,
 * never the body, so each artifact can be access-controlled on its own.
 */
export interface ArtifactStore {
  put(key: string, body: string): Promise<string>;
  get(ref: string): Promise<string>;
  exists(ref: string): Promise<boolean>;
}

/** Accepts either a bare key or the s3://bucket/key pointer we hand out. */
function toKey(ref: string): string {
  return ref.replace(/^s3:\/\/[^/]+\//, '');
}

export class LocalArtifactStore implements ArtifactStore {
  constructor(private dir = config.artifactDir) {
    fs.mkdirSync(this.dir, { recursive: true });
  }
  private p(key: string) {
    const f = path.join(this.dir, key.replace(/[^a-zA-Z0-9._/-]/g, '_'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    return f;
  }
  async put(key: string, body: string) {
    fs.writeFileSync(this.p(key), body);
    return `s3://${config.aws.bucket}/${key}`;
  }
  async get(ref: string) {
    const f = this.p(toKey(ref));
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  }
  async exists(ref: string) { return fs.existsSync(this.p(toKey(ref))); }
}

export class S3ArtifactStore implements ArtifactStore {
  private client = new S3Client({ region: config.aws.region });

  constructor(private readonly bucket = config.aws.bucket) {}

  async put(key: string, body: string) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body, ContentType: 'text/markdown; charset=utf-8',
    }));
    return `s3://${this.bucket}/${key}`;
  }

  async get(ref: string) {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: toKey(ref) }));
      return (await out.Body?.transformToString('utf-8')) ?? '';
    } catch (error) {
      // A missing artifact must not break an assessment view; it reads as empty.
      console.warn(`S3 get failed for ${ref}: ${error instanceof Error ? error.message : error}`);
      return '';
    }
  }

  async exists(ref: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: toKey(ref) }));
      return true;
    } catch { return false; }
  }
}

export function createArtifactStore(): ArtifactStore {
  return config.artifacts === 's3' ? new S3ArtifactStore() : new LocalArtifactStore();
}

export const artifacts: ArtifactStore = createArtifactStore();

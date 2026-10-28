import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/** Work artifacts live in object storage (S3 in AWS, a local folder here). */
export interface ArtifactStore {
  put(key: string, body: string): Promise<string>;
  get(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
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
  async get(key: string) {
    const f = this.p(key.replace(/^s3:\/\/[^/]+\//, ''));
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  }
  async exists(key: string) {
    return fs.existsSync(this.p(key.replace(/^s3:\/\/[^/]+\//, '')));
  }
}

export const artifacts: ArtifactStore = new LocalArtifactStore();

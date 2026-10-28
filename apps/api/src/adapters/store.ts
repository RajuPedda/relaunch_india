import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/**
 * Single-table store shaped like DynamoDB: pk = entity type, sk = id, plus
 * secondary lookups by indexed attributes. The local driver persists one JSON
 * file per entity type so the demo survives a restart and is inspectable.
 *
 * To move to DynamoDB, implement `Store` with DocumentClient calls against a
 * table keyed (pk, sk) with GSIs on the attributes listed in INDEXES.
 */
export interface Store {
  put<T extends object>(type: string, id: string, item: T): Promise<T>;
  get<T>(type: string, id: string): Promise<T | undefined>;
  list<T>(type: string): Promise<T[]>;
  find<T>(type: string, pred: (item: T) => boolean): Promise<T[]>;
  update<T extends object>(type: string, id: string, patch: Partial<T>): Promise<T>;
  remove(type: string, id: string): Promise<void>;
  reset(): Promise<void>;
}

/** GSI plan for the real table - documented so infra and code stay in sync. */
export const INDEXES: Record<string, string[]> = {
  job: ['orgId', 'status', 'roleFamily'],
  profile: ['roleFamily', 'sponsorOrgId'],
  evidence: ['profileId', 'competencyKey'],
  assessment: ['profileId', 'roleId', 'status'],
  application: ['jobId', 'profileId', 'orgId', 'status'],
  match: ['jobId', 'profileId'],
  notification: ['recipientId', 'state', 'dedupeKey'],
  submission: ['profileId', 'taskId'],
  effort: ['profileId', 'roleId'],
};

export class LocalJsonStore implements Store {
  private cache = new Map<string, Map<string, any>>();

  constructor(private dir = config.dataDir) {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(type: string) {
    return path.join(this.dir, `${type}.json`);
  }

  private load(type: string): Map<string, any> {
    const cached = this.cache.get(type);
    if (cached) return cached;
    let map = new Map<string, any>();
    const f = this.file(type);
    if (fs.existsSync(f)) {
      const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>;
      map = new Map(Object.entries(raw));
    }
    this.cache.set(type, map);
    return map;
  }

  private flush(type: string) {
    const map = this.load(type);
    fs.writeFileSync(this.file(type), JSON.stringify(Object.fromEntries(map), null, 2));
  }

  async put<T extends object>(type: string, id: string, item: T): Promise<T> {
    this.load(type).set(id, item);
    this.flush(type);
    return item;
  }

  async get<T>(type: string, id: string): Promise<T | undefined> {
    return this.load(type).get(id) as T | undefined;
  }

  async list<T>(type: string): Promise<T[]> {
    return [...this.load(type).values()] as T[];
  }

  async find<T>(type: string, pred: (item: T) => boolean): Promise<T[]> {
    return (await this.list<T>(type)).filter(pred);
  }

  async update<T extends object>(type: string, id: string, patch: Partial<T>): Promise<T> {
    const current = await this.get<T>(type, id);
    if (!current) throw new Error(`${type}/${id} not found`);
    const next = { ...current, ...patch } as T;
    return this.put(type, id, next);
  }

  async remove(type: string, id: string): Promise<void> {
    this.load(type).delete(id);
    this.flush(type);
  }

  async reset(): Promise<void> {
    this.cache.clear();
    if (fs.existsSync(this.dir)) fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
  }
}

export function createStore(): Store {
  if (config.backend === 'aws') {
    // Swap in a DynamoDB-backed Store here; the interface above is the contract.
    throw new Error('AWS backend not wired in this POC. Set RELAUNCH_BACKEND=local.');
  }
  return new LocalJsonStore();
}

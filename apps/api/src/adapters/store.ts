import fs from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';

/**
 * Single-table store. `pk` is the entity type, `sk` the id — the same shape in
 * both drivers, so no domain code changes when the backing store does.
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

/** Entity types, and the attributes a GSI would carry for each in a larger deployment. */
export const INDEXES: Record<string, string[]> = {
  org: [], profile: ['roleFamily', 'sponsorOrgId'], role: ['roleFamily', 'status'],
  submission: ['profileId', 'taskId'], assessment: ['profileId', 'roleId', 'status'],
  evidence: ['profileId', 'competencyKey'], job: ['orgId', 'status', 'roleFamily'],
  match: ['jobId', 'profileId'], application: ['jobId', 'profileId', 'orgId', 'status'],
  consent: ['profileId'], notification: ['recipientId', 'state', 'dedupeKey'],
  audit: [], effort: ['profileId', 'roleId'],
};

export const ENTITY_TYPES = Object.keys(INDEXES);

/* ----------------------------- local driver ----------------------------- */

export class LocalJsonStore implements Store {
  private cache = new Map<string, Map<string, any>>();

  constructor(private dir = config.dataDir) {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(type: string) { return path.join(this.dir, `${type}.json`); }

  private load(type: string): Map<string, any> {
    const cached = this.cache.get(type);
    if (cached) return cached;
    let map = new Map<string, any>();
    const f = this.file(type);
    if (fs.existsSync(f)) {
      map = new Map(Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>));
    }
    this.cache.set(type, map);
    return map;
  }

  private flush(type: string) {
    fs.writeFileSync(this.file(type), JSON.stringify(Object.fromEntries(this.load(type)), null, 2));
  }

  async put<T extends object>(type: string, id: string, item: T): Promise<T> {
    this.load(type).set(id, item);
    this.flush(type);
    return item;
  }
  async get<T>(type: string, id: string) { return this.load(type).get(id) as T | undefined; }
  async list<T>(type: string) { return [...this.load(type).values()] as T[]; }
  async find<T>(type: string, pred: (item: T) => boolean) { return (await this.list<T>(type)).filter(pred); }
  async update<T extends object>(type: string, id: string, patch: Partial<T>): Promise<T> {
    const current = await this.get<T>(type, id);
    if (!current) throw new Error(`${type}/${id} not found`);
    return this.put(type, id, { ...current, ...patch } as T);
  }
  async remove(type: string, id: string) { this.load(type).delete(id); this.flush(type); }
  async reset() {
    this.cache.clear();
    if (fs.existsSync(this.dir)) fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
  }
}

/* --------------------------- DynamoDB driver ---------------------------- */

/**
 * Table: partition key `pk` (string), sort key `sk` (string). Nothing else is
 * required — the demo's access patterns are "one item by id" and "every item of
 * a type", which this layout answers without a secondary index. INDEXES above
 * records the attributes a GSI would carry at larger scale.
 */
export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;

  constructor(private readonly table = config.aws.tableName) {
    this.doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.aws.region }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  private strip<T>(item: Record<string, unknown> | undefined): T | undefined {
    if (!item) return undefined;
    const { pk, sk, ...rest } = item;
    return rest as T;
  }

  async put<T extends object>(type: string, id: string, item: T): Promise<T> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: type, sk: id, ...item } }));
    return item;
  }

  async get<T>(type: string, id: string): Promise<T | undefined> {
    const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: type, sk: id } }));
    return this.strip<T>(out.Item);
  }

  async list<T>(type: string): Promise<T[]> {
    const items: T[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'pk' },
        ExpressionAttributeValues: { ':pk': type },
        ExclusiveStartKey: start,
      }));
      for (const item of out.Items ?? []) {
        const stripped = this.strip<T>(item);
        if (stripped) items.push(stripped);
      }
      start = out.LastEvaluatedKey;
    } while (start);
    return items;
  }

  async find<T>(type: string, pred: (item: T) => boolean) { return (await this.list<T>(type)).filter(pred); }

  async update<T extends object>(type: string, id: string, patch: Partial<T>): Promise<T> {
    const current = await this.get<T>(type, id);
    if (!current) throw new Error(`${type}/${id} not found`);
    return this.put(type, id, { ...current, ...patch } as T);
  }

  async remove(type: string, id: string) {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { pk: type, sk: id } }));
  }

  /** Deletes every item this application owns. Only the seed calls it. */
  async reset() {
    for (const type of ENTITY_TYPES) {
      for (const item of await this.list<{ id?: string }>(type)) {
        if (item.id) await this.remove(type, item.id);
      }
    }
  }
}

export function createStore(): Store {
  return config.store === 'dynamodb' ? new DynamoStore() : new LocalJsonStore();
}

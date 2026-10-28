import { createStore } from '../adapters/store.js';
import { newId, nowIso, type AuditEntry } from '@relaunch/shared';

export const store = createStore();

export async function audit(actor: string, action: string, subject: string, detail: Record<string, unknown> = {}) {
  const entry: AuditEntry = { id: newId('aud'), kind: 'audit', actor, action, subject, detail, createdAt: nowIso() };
  await store.put('audit', entry.id, entry);
  return entry;
}

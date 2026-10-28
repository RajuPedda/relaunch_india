const BASE = '/api';

async function request<T>(path: string, init?: RequestInit & { actor?: string }): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.actor ? { 'x-actor': init.actor } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(body?.error ?? `${response.status} ${response.statusText}`);
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, actor?: string) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}), actor }),
  patch: <T>(path: string, body?: unknown, actor?: string) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}), actor }),
};

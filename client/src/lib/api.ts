import type { PersonaKey } from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * All API calls go through here. In the production design this attaches the
 * Firebase ID token and App Check token; in this demo it attaches the active persona.
 */
export async function secureFetch<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; persona: PersonaKey }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers: { 'x-demo-persona': opts.persona, ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the SmartPark server. Check your connection and try again.', 0);
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const m = json?.message;
    throw new ApiError(Array.isArray(m) ? m.join(' ') : (m ?? `Request failed (${res.status}).`), res.status);
  }
  return json as T;
}

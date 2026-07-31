/** Browser and shared client helpers — always hit same-origin BFF `/api/v1`. */

export function clientApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `/api/v1${normalized}`
}

export function clientApiHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' }
}

/** Multipart / SSE: cookies carry the session; no Authorization header. */
export function authOnlyHeaders(): HeadersInit {
  return {}
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(clientApiUrl(path), {
    headers: clientApiHeaders(),
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function apiPost<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(clientApiUrl(path), {
    method: 'POST',
    headers: clientApiHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function apiPut<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(clientApiUrl(path), {
    method: 'PUT',
    headers: clientApiHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function apiPatch<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(clientApiUrl(path), {
    method: 'PATCH',
    headers: clientApiHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(clientApiUrl(path), {
    method: 'DELETE',
    headers: clientApiHeaders()
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

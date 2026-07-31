/** Server-only Hono client (RSC / route handlers). Never import from client components. */

const API_URL = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000'
).replace(/\/$/, '')

const API_TOKEN = process.env.API_TOKEN ?? 'dev-api-token-change-me'

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${API_TOKEN}`)
  const normalized = path.startsWith('/') ? path : `/${path}`
  const res = await fetch(`${API_URL}/api/v1${normalized}`, {
    ...init,
    headers,
    cache: 'no-store'
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json() as Promise<T>
}

import { apiToken, apiUrl } from './env.js'

export async function api(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${apiToken}`)
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    headers
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(
      typeof json === 'object' && json && 'error' in json
        ? String((json as { error: string }).error)
        : text || res.statusText
    )
  }
  return json
}

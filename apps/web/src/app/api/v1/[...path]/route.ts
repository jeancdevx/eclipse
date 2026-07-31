import { headers } from 'next/headers'

import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length'
])

function upstreamBase(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '')
}

function apiToken(): string {
  return process.env.API_TOKEN ?? 'dev-api-token-change-me'
}

async function assertSession(): Promise<Response | null> {
  if (process.env.AUTH_DEV_BYPASS === 'true') return null
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}

async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const denied = await assertSession()
  if (denied) return denied

  const { path } = await context.params
  const suffix = path.map(encodeURIComponent).join('/')
  const incoming = new URL(request.url)
  const target = `${upstreamBase()}/api/v1/${suffix}${incoming.search}`

  const outbound = new Headers()
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return
    if (key.toLowerCase() === 'authorization') return
    outbound.set(key, value)
  })
  outbound.set('Authorization', `Bearer ${apiToken()}`)

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: outbound,
    redirect: 'manual'
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }

  const upstream = await fetch(target, init)
  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return
    responseHeaders.set(key, value)
  })

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy

import { createAuth, parseAllowlist } from '@eclipse/auth'
import { createDb } from '@eclipse/db'

const db = createDb(
  process.env.DATABASE_URL ??
    'postgresql://eclipse:eclipse@localhost:5432/eclipse'
)

const microsoft =
  process.env.MICROSOFT_CLIENT_ID &&
  process.env.MICROSOFT_CLIENT_SECRET &&
  process.env.MICROSOFT_TENANT_ID
    ? {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_TENANT_ID
      }
    : undefined

export const auth = createAuth({
  db,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret:
    process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me-to-32chars-min',
  allowlist: parseAllowlist(process.env.AUTH_ALLOWLIST),
  microsoft,
  devBypass: process.env.AUTH_DEV_BYPASS === 'true'
})

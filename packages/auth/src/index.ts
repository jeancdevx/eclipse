import { betterAuth } from 'better-auth'

import type { Db } from '@eclipse/db'
import * as schema from '@eclipse/db'

import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export type AuthOptions = {
  db: Db
  baseURL: string
  secret: string
  allowlist: string[]
  microsoft?: {
    clientId: string
    clientSecret: string
    tenantId: string
  }
  devBypass: boolean
}

export function createAuth(opts: AuthOptions) {
  const socialProviders =
    opts.microsoft && !opts.devBypass
      ? {
          microsoft: {
            clientId: opts.microsoft.clientId,
            clientSecret: opts.microsoft.clientSecret,
            tenantId: opts.microsoft.tenantId
          }
        }
      : undefined

  return betterAuth({
    database: drizzleAdapter(opts.db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications
      }
    }),
    secret: opts.secret,
    baseURL: opts.baseURL,
    socialProviders,
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            if (opts.allowlist.length === 0) return { data: user }
            const email = user.email?.toLowerCase()
            if (!email || !opts.allowlist.includes(email)) {
              throw new Error('User not allowlisted')
            }
            return { data: user }
          }
        }
      }
    }
  })
}

export type Auth = ReturnType<typeof createAuth>

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

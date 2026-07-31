import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '../../.env') })
config()

export const token = process.env.DISCORD_TOKEN
export const clientId = process.env.DISCORD_CLIENT_ID
export const guildId = process.env.DISCORD_GUILD_ID
export const apiUrl = process.env.API_URL ?? 'http://localhost:4000'
export const apiToken = process.env.API_TOKEN ?? 'dev-api-token-change-me'
export const adminIds = new Set(
  (process.env.DISCORD_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
)

if (process.env.NODE_ENV === 'production' && adminIds.size === 0) {
  console.error(
    '[bot] DISCORD_ADMIN_USER_IDS must be set (comma-separated Discord user IDs) when NODE_ENV=production'
  )
  process.exit(1)
}

import { config as loadEnv } from 'dotenv'
import type { NextConfig } from 'next'
import { resolve } from 'node:path'

loadEnv({ path: resolve(process.cwd(), '../../.env') })
loadEnv({ path: resolve(process.cwd(), '../../.env.local'), override: true })
loadEnv({ path: resolve(process.cwd(), '.env') })
loadEnv({ path: resolve(process.cwd(), '.env.local'), override: true })

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@eclipse/shared', '@eclipse/auth', '@eclipse/db'],
  serverExternalPackages: ['postgres', 'drizzle-orm']
  // No NEXT_PUBLIC_API_* baking — dashboard uses same-origin BFF /api/v1.
}

export default nextConfig

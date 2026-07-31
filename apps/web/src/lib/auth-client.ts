'use client'

import { createAuthClient } from 'better-auth/react'

function authBaseURL(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return (
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.BETTER_AUTH_URL ??
    'http://localhost:3000'
  )
}

export const authClient = createAuthClient({
  baseURL: authBaseURL()
})

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/login-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

import { auth } from '@/lib/auth'

function isDevBypass() {
  return process.env.AUTH_DEV_BYPASS === 'true'
}

function isMicrosoftConfigured() {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.MICROSOFT_TENANT_ID
  )
}

export default async function HomePage() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (isDevBypass() || session) {
    redirect('/dashboard')
  }

  return (
    <main className='mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6'>
      <div>
        <p className='font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase'>
          Eclipse
        </p>
        <h1 className='mt-2 text-3xl font-semibold tracking-tight'>
          Control plane
        </h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          Sign in to manage your Minecraft instances.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use Microsoft Entra or local bypass.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            devBypass={isDevBypass()}
            microsoftConfigured={isMicrosoftConfigured()}
          />
        </CardContent>
      </Card>
    </main>
  )
}

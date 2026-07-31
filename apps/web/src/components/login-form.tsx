'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'

import { authClient } from '@/lib/auth-client'

type Props = {
  devBypass: boolean
  microsoftConfigured: boolean
}

export function LoginForm({ devBypass, microsoftConfigured }: Props) {
  const router = useRouter()

  return (
    <div className='flex flex-col gap-3'>
      {microsoftConfigured ? (
        <Button
          type='button'
          onClick={() => {
            void authClient.signIn.social({
              provider: 'microsoft',
              callbackURL: '/dashboard'
            })
          }}
        >
          Continue with Microsoft
        </Button>
      ) : null}

      {devBypass ? (
        <>
          <Button
            type='button'
            variant={microsoftConfigured ? 'secondary' : 'default'}
            onClick={() => router.push('/dashboard')}
          >
            Enter local dashboard
          </Button>
          <p className='text-xs text-muted-foreground'>
            Local bypass is on (<code>AUTH_DEV_BYPASS</code>).
          </p>
        </>
      ) : null}

      {!devBypass && !microsoftConfigured ? (
        <p className='text-sm text-destructive'>
          Sign-in requires Microsoft Entra credentials. Configure them in the
          repo root <code>.env</code>.
        </p>
      ) : null}
    </div>
  )
}

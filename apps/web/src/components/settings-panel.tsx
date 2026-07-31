'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiGet, apiPost } from '@/lib/client-api'
import type { ConnectionPayload } from '@/lib/types'

export function SettingsPanel() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('25565')
  const [connection, setConnection] = useState<ConnectionPayload | null>(null)
  const [cfConfigured, setCfConfigured] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [conn, caps] = await Promise.all([
        apiGet<ConnectionPayload>('/server/connection'),
        apiGet<{ curseforgeConfigured: boolean }>('/server/capabilities')
      ])
      setConnection(conn)
      setHost(conn.host)
      setPort(String(conn.port))
      setCfConfigured(caps.curseforgeConfigured)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function save() {
    try {
      await apiPost('/server/connection', {
        host: host.trim(),
        port: Number(port)
      })
      toast.success('Connection settings saved')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Settings</h1>
        <p className='text-sm text-muted-foreground'>
          Join address and provider credentials.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Join address</CardTitle>
          <CardDescription>
            Shown on the Overview connection card. Use a DNS name in production.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='join-host'>Host</FieldLabel>
              <Input
                id='join-host'
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder='play.example.com'
              />
              <FieldDescription>
                Current resolved address:{' '}
                <code>{connection?.address ?? '—'}</code> ({connection?.source})
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor='join-port'>Port</FieldLabel>
              <Input
                id='join-port'
                value={port}
                onChange={e => setPort(e.target.value)}
              />
            </Field>
            <Button type='button' onClick={() => void save()}>
              Save
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CurseForge</CardTitle>
          <CardDescription>
            Required for Auto CurseForge modpack installs via itzg.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cfConfigured ? (
            <Alert>
              <AlertTitle>API key configured</AlertTitle>
              <AlertDescription>
                <code>CF_API_KEY</code> is set on the API process.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>API key missing</AlertTitle>
              <AlertDescription>
                Add <code>CF_API_KEY</code> to the repo root <code>.env</code>{' '}
                and restart the API.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

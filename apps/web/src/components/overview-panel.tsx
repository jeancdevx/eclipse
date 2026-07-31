'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  CopyIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ConsolePanel } from '@/components/console-panel'
import { apiGet, apiPost } from '@/lib/client-api'
import type { ConnectionPayload, Instance, StatusPayload } from '@/lib/types'

export function OverviewPanel() {
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [connection, setConnection] = useState<ConnectionPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [st, conn] = await Promise.all([
        apiGet<StatusPayload>('/server/status'),
        apiGet<ConnectionPayload>('/server/connection')
      ])
      setStatus(st)
      setConnection(conn)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [refresh])

  async function run(path: string, label: string) {
    try {
      await apiPost(path)
      toast.success(label)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : label)
    }
  }

  const container = status?.status.container ?? 'unknown'
  const online = container === 'running'
  const active = status?.activeInstance as Instance | null | undefined

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Overview</h1>
        <p className='text-sm text-muted-foreground'>
          Status, join address, and console for the active instance.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Share this address with players.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            {loading && !connection ? (
              <Skeleton className='h-10 w-full' />
            ) : (
              <>
                <div className='flex items-center gap-2'>
                  <code className='flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-sm'>
                    {connection?.address ?? '—'}
                  </code>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    disabled={!connection}
                    onClick={() => {
                      if (!connection) return
                      void navigator.clipboard.writeText(connection.address)
                      toast.success('Address copied')
                    }}
                  >
                    <CopyIcon />
                  </Button>
                </div>
                <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                  <Badge variant={online ? 'default' : 'secondary'}>
                    {online ? 'Online' : 'Offline'}
                  </Badge>
                  <span>source: {connection?.source ?? '—'}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Server</CardTitle>
            <CardDescription>Lifecycle controls for the container.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-center gap-2 text-sm'>
              <Badge variant='outline'>{container}</Badge>
              <span className='text-muted-foreground'>
                {status?.status.playersOnline ?? 0} players
              </span>
              {status?.status.vmPowerState ? (
                <span className='text-muted-foreground'>
                  VM {status.status.vmPowerState}
                </span>
              ) : null}
            </div>
            <Separator />
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                size='sm'
                onClick={() => void run('/server/start', 'Server started')}
              >
                <PlayIcon data-icon='inline-start' />
                Start
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => void run('/server/stop', 'Server stopped')}
              >
                <SquareIcon data-icon='inline-start' />
                Stop
              </Button>
              <Button
                type='button'
                size='sm'
                variant='secondary'
                onClick={() => void run('/server/restart', 'Server restarted')}
              >
                <RefreshCwIcon data-icon='inline-start' />
                Restart
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle>Active instance</CardTitle>
            <CardDescription>Currently linked world profile.</CardDescription>
          </CardHeader>
          <CardContent>
            {active ? (
              <div className='flex flex-col gap-1'>
                <p className='font-medium'>{active.name}</p>
                <p className='text-sm text-muted-foreground'>
                  {active.loader} {active.mcVersion} · {active.status}
                </p>
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>No active instance</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ConsolePanel />
    </div>
  )
}

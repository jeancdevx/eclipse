'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SendIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  apiPost,
  clientApiHeaders,
  clientApiUrl
} from '@/lib/client-api'

export function ConsolePanel() {
  const [logs, setLogs] = useState<string[]>([])
  const [rcon, setRcon] = useState('')
  const [rconOut, setRconOut] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    void (async () => {
      try {
        const res = await fetch(clientApiUrl('/server/logs'), {
          headers: clientApiHeaders(),
          signal: ac.signal
        })
        if (!res.body) return
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.replace(/^data:\s*/, '')
            try {
              const msg = JSON.parse(line) as string
              setLogs(prev => [...prev.slice(-300), msg])
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        // aborted or closed
      }
    })()
    return () => ac.abort()
  }, [])

  async function sendRcon(e: React.FormEvent) {
    e.preventDefault()
    if (!rcon.trim()) return
    try {
      const data = await apiPost<{ result: string }>('/server/rcon', {
        command: rcon
      })
      setRconOut(data.result ?? '')
      setRcon('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'RCON failed')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Console</CardTitle>
        <CardDescription>Live container logs and RCON.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <ScrollArea className='h-72 rounded-md border bg-muted/40'>
          <pre className='p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap'>
            {logs.length === 0
              ? 'Waiting for logs…'
              : logs.map((l, i) => (
                  <div key={`${i}-${l.slice(0, 24)}`}>{l}</div>
                ))}
          </pre>
        </ScrollArea>
        <form onSubmit={e => void sendRcon(e)}>
          <InputGroup>
            <InputGroupInput
              placeholder='RCON command'
              value={rcon}
              onChange={e => setRcon(e.target.value)}
            />
            <InputGroupAddon align='inline-end'>
              <InputGroupButton type='submit' variant='secondary'>
                <SendIcon data-icon='inline-start' />
                Send
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        {rconOut ? (
          <pre className='overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs'>
            {rconOut}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  )
}

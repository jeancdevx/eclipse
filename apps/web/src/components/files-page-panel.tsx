'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { FileManager } from '@/components/file-manager'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { apiGet } from '@/lib/client-api'
import type { Instance, StatusPayload } from '@/lib/types'

export function FilesPagePanel() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [selected, setSelected] = useState<string>('')
  const [status, setStatus] = useState<StatusPayload | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [inst, st] = await Promise.all([
        apiGet<{ instances: Instance[] }>('/instances'),
        apiGet<StatusPayload>('/server/status')
      ])
      setInstances(inst.instances ?? [])
      setStatus(st)
      const active = (inst.instances ?? []).find(i => i.isActive)
      setSelected(prev => prev || active?.id || inst.instances?.[0]?.id || '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Files</h1>
          <p className='text-sm text-muted-foreground'>
            Browse and edit instance data with drag-and-drop upload.
          </p>
        </div>
        {instances.length > 0 ? (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className='w-56'>
              <SelectValue placeholder='Instance' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {instances.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                    {i.isActive ? ' (active)' : ''}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {selected ? (
        <FileManager
          instanceId={selected}
          serverRunning={status?.status.container === 'running'}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No instances</EmptyTitle>
            <EmptyDescription>
              Create an instance first to manage files.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

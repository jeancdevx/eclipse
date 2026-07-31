'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import {
  MEMORY_PRESET_MAP,
  loaderVersionEnvKey,
  type MemoryPreset
} from '@eclipse/shared'

import { CreateInstanceDialog } from '@/components/create-instance-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { apiDelete, apiGet, apiPost } from '@/lib/client-api'
import type { Instance } from '@/lib/types'

export function InstancesPanel() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [open, setOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Instance | null>(null)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ instances: Instance[] }>('/instances')
      setInstances(data.instances ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function activate(id: string) {
    try {
      await apiPost(`/instances/${id}/activate`)
      toast.success('Instance activated')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Activate failed')
    }
  }

  async function backup(id: string) {
    try {
      await apiPost('/backups', { instanceId: id, triggeredBy: 'panel' })
      toast.success('Backup started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed')
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await apiDelete<{
        ok: boolean
        dataRemoved?: boolean
        dataWarning?: string
      }>(`/instances/${pendingDelete.id}`)
      if (res.dataWarning) {
        toast.warning(
          `Instance removed from panel. Data on disk: ${res.dataWarning}`
        )
      } else {
        toast.success(
          res.dataRemoved
            ? 'Instance and world data deleted'
            : 'Instance deleted'
        )
      }
      setPendingDelete(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  function loaderLine(inst: Instance) {
    const key = loaderVersionEnvKey(inst.loader)
    const pin = key ? inst.env?.[key] : undefined
    return pin
      ? `${inst.loader} ${inst.mcVersion} @ ${pin}`
      : `${inst.loader} ${inst.mcVersion}`
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Instances</h1>
          <p className='text-sm text-muted-foreground'>
            Profiles on disk. Only one can be active at a time.
          </p>
        </div>
        <Button type='button' onClick={() => setOpen(true)}>
          <PlusIcon data-icon='inline-start' />
          New instance
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All instances</CardTitle>
          <CardDescription>
            Switch, open details, delete idle profiles, or back up the active
            world.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Loader</TableHead>
                <TableHead>Memory</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map(inst => (
                <TableRow key={inst.id}>
                  <TableCell>
                    <div className='flex flex-col gap-0.5'>
                      <Link
                        href={`/dashboard/instances/${inst.id}`}
                        className='font-medium hover:underline'
                      >
                        {inst.name}
                      </Link>
                      <span className='font-mono text-xs text-muted-foreground'>
                        {inst.slug}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='text-sm'>{loaderLine(inst)}</TableCell>
                  <TableCell className='text-sm'>
                    {MEMORY_PRESET_MAP[inst.memoryPreset as MemoryPreset] ??
                      inst.memoryPreset}
                  </TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      <Badge variant='outline'>{inst.status}</Badge>
                      {inst.isActive ? <Badge>active</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-2'>
                      {!inst.isActive ? (
                        <>
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => void activate(inst.id)}
                          >
                            Switch
                          </Button>
                          <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            onClick={() => setPendingDelete(inst)}
                          >
                            <Trash2Icon data-icon='inline-start' />
                            Delete
                          </Button>
                        </>
                      ) : (
                        <Button
                          type='button'
                          size='sm'
                          variant='secondary'
                          onClick={() => void backup(inst.id)}
                        >
                          Backup
                        </Button>
                      )}
                      <Button type='button' size='sm' variant='ghost' asChild>
                        <Link href={`/dashboard/instances/${inst.id}`}>
                          Open
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {instances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className='text-muted-foreground'>
                    No instances yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateInstanceDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => void refresh()}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete instance?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes{' '}
              <span className='font-medium text-foreground'>
                {pendingDelete?.name}
              </span>{' '}
              ({pendingDelete?.slug}) from the panel and deletes its world data
              on disk. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={deleting}
              onClick={e => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

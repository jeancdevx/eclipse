'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  loaderVersionEnvKey,
  loaderVersionLabel
} from '@eclipse/shared'

import { FileManager } from '@/components/file-manager'
import { InstanceHeader } from '@/components/instance-detail/instance-header'
import { ModpackPanel } from '@/components/instance-detail/modpack-panel'
import { ModsPanel } from '@/components/instance-detail/mods-panel'
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
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  authOnlyHeaders,
  clientApiUrl
} from '@/lib/client-api'
import type { Instance, StatusPayload } from '@/lib/types'

export function InstanceDetail({ instanceId }: { instanceId: string }) {
  const router = useRouter()
  const [instance, setInstance] = useState<Instance | null>(null)
  const [mods, setMods] = useState<string[]>([])
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [provider, setProvider] = useState<'modrinth' | 'curseforge'>(
    'modrinth'
  )
  const [packUrl, setPackUrl] = useState('')
  const [packVersion, setPackVersion] = useState('')
  const [excludeFiles, setExcludeFiles] = useState('')
  const [cfConfigured, setCfConfigured] = useState(true)
  const [loaderVersionDraft, setLoaderVersionDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [inst, st, modsRes] = await Promise.all([
        apiGet<{ instance: Instance }>(`/instances/${instanceId}`),
        apiGet<StatusPayload>('/server/status'),
        apiGet<{ mods: string[] }>(`/instances/${instanceId}/mods`)
      ])
      setInstance(inst.instance)
      setStatus(st)
      setMods(modsRes.mods ?? [])
      const key = loaderVersionEnvKey(inst.instance.loader)
      setLoaderVersionDraft(key ? (inst.instance.env?.[key] ?? '') : '')
      const ex = inst.instance.env?.MODRINTH_EXCLUDE_FILES
      if (ex) setExcludeFiles(ex)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Load failed')
    }
  }, [instanceId])

  useEffect(() => {
    void refresh()
    void apiGet<{ curseforgeConfigured: boolean }>('/server/capabilities')
      .then((c) => setCfConfigured(c.curseforgeConfigured))
      .catch(() => setCfConfigured(false))
  }, [refresh])

  async function installPack() {
    try {
      await apiPost(`/instances/${instanceId}/modpacks/install`, {
        provider,
        url: packUrl,
        version: packVersion || undefined,
        excludeFiles:
          provider === 'modrinth' ? excludeFiles.trim() || undefined : undefined
      })
      toast.success('Modpack configured — activate/restart to apply')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Install failed')
    }
  }

  async function saveExcludes() {
    try {
      const cur = await apiGet<{ instance: Instance }>(
        `/instances/${instanceId}`
      )
      const excludes = excludeFiles
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const overrideGlobs = excludes.map((e) =>
        e.includes('/') || e.includes('*') ? e : `mods/*${e}*.jar`
      )
      const next = {
        ...cur.instance.env,
        MODRINTH_EXCLUDE_FILES: excludes.join(','),
        MODRINTH_OVERRIDES_EXCLUSIONS: [
          ...(cur.instance.env?.MODRINTH_OVERRIDES_EXCLUSIONS?.split(/[,\n]/) ??
            []),
          ...overrideGlobs
        ]
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(','),
        MODRINTH_FORCE_SYNCHRONIZE: 'true'
      }
      await apiPatch(`/instances/${instanceId}`, { env: next })
      toast.success('Excludes saved — restart to re-sync pack')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function uploadPack(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append(
      'provider',
      file.name.endsWith('.mrpack') ? 'modrinth' : 'curseforge'
    )
    try {
      const res = await fetch(
        clientApiUrl(`/instances/${instanceId}/modpacks/upload`),
        { method: 'POST', headers: authOnlyHeaders(), body: fd }
      )
      if (!res.ok) throw new Error(await res.text())
      toast.success('Pack uploaded')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function uploadMod(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(clientApiUrl(`/instances/${instanceId}/mods`), {
        method: 'POST',
        headers: authOnlyHeaders(),
        body: fd
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Mod uploaded')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function deleteMod(name: string) {
    try {
      await apiDelete(
        `/instances/${instanceId}/mods/${encodeURIComponent(name)}`
      )
      toast.success('Mod deleted')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function saveLoaderVersion() {
    try {
      await apiPatch(`/instances/${instanceId}`, {
        loaderVersion: loaderVersionDraft.trim()
      })
      toast.success('Loader version saved — activate/restart to apply')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function deleteInstance() {
    setDeleting(true)
    try {
      const res = await apiDelete<{
        ok: boolean
        dataRemoved?: boolean
        dataWarning?: string
      }>(`/instances/${instanceId}`)
      if (res.dataWarning) {
        toast.warning(
          `Instance removed. Data on disk: ${res.dataWarning}`
        )
      } else {
        toast.success(
          res.dataRemoved
            ? 'Instance and world data deleted'
            : 'Instance deleted'
        )
      }
      router.push('/dashboard/instances')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (!instance) {
    return <p className='text-sm text-muted-foreground'>Loading…</p>
  }

  const running = status?.status.container === 'running'
  const versionLabel = loaderVersionLabel(instance.loader)

  return (
    <div className='flex flex-col gap-6'>
      <InstanceHeader
        instance={instance}
        onDelete={
          instance.isActive ? undefined : () => setConfirmDelete(true)
        }
      />

      <Tabs defaultValue='overview'>
        <TabsList>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='modpack'>Modpack</TabsTrigger>
          <TabsTrigger value='mods'>Mods</TabsTrigger>
          <TabsTrigger value='files'>Files</TabsTrigger>
        </TabsList>

        <TabsContent value='overview' className='mt-4'>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                Instance metadata and runtime env.
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4 text-sm sm:grid-cols-2'>
              <div>
                <p className='text-muted-foreground'>Slug</p>
                <p className='font-mono'>{instance.slug}</p>
              </div>
              <div>
                <p className='text-muted-foreground'>Memory</p>
                <p>{instance.memoryPreset}</p>
              </div>
              {versionLabel ? (
                <div className='sm:col-span-2'>
                  <Field>
                    <FieldLabel htmlFor='loader-version-pin'>
                      {versionLabel}
                    </FieldLabel>
                    <div className='flex flex-wrap gap-2'>
                      <Input
                        id='loader-version-pin'
                        className='max-w-xs'
                        placeholder='e.g. 21.1.228 (empty = latest)'
                        value={loaderVersionDraft}
                        onChange={e => setLoaderVersionDraft(e.target.value)}
                      />
                      <Button
                        type='button'
                        size='sm'
                        variant='secondary'
                        onClick={() => void saveLoaderVersion()}
                      >
                        Save
                      </Button>
                    </div>
                    <FieldDescription>
                      Pins itzg{' '}
                      <code>
                        {loaderVersionEnvKey(instance.loader) ?? 'VERSION'}
                      </code>
                      . Needed when a pack expects an exact NeoForge/Forge
                      build (e.g. 21.1.228 instead of latest 21.1.x).
                    </FieldDescription>
                  </Field>
                </div>
              ) : null}
              <div className='sm:col-span-2'>
                <p className='text-muted-foreground'>Env overrides</p>
                <pre className='mt-1 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs'>
                  {JSON.stringify(instance.env ?? {}, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='modpack' className='mt-4'>
          <ModpackPanel
            provider={provider}
            packUrl={packUrl}
            packVersion={packVersion}
            excludeFiles={excludeFiles}
            cfConfigured={cfConfigured}
            onProviderChange={setProvider}
            onPackUrlChange={setPackUrl}
            onPackVersionChange={setPackVersion}
            onExcludeFilesChange={setExcludeFiles}
            onInstall={() => void installPack()}
            onSaveExcludes={() => void saveExcludes()}
            onUploadPack={(f) => void uploadPack(f)}
          />
        </TabsContent>

        <TabsContent value='mods' className='mt-4'>
          <ModsPanel
            mods={mods}
            onUpload={(f) => void uploadMod(f)}
            onDelete={(name) => void deleteMod(name)}
          />
        </TabsContent>

        <TabsContent value='files' className='mt-4'>
          <FileManager instanceId={instanceId} serverRunning={running} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete instance?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes {instance.name} ({instance.slug}) and its world data.
              Active instances cannot be deleted — switch away first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={deleting}
              onClick={e => {
                e.preventDefault()
                void deleteInstance()
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

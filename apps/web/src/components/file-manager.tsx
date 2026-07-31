'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  Trash2Icon,
  UploadIcon
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  authOnlyHeaders,
  apiDelete,
  apiGet,
  apiPut,
  clientApiUrl
} from '@/lib/client-api'
import type { FileEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
      Loading editor…
    </div>
  )
})

const TEXT_EXT = new Set([
  'properties',
  'json',
  'toml',
  'yml',
  'yaml',
  'cfg',
  'txt',
  'md',
  'log',
  'snbt',
  'mcmeta'
])

function languageFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'json' || ext === 'mcmeta') return 'json'
  if (ext === 'yml' || ext === 'yaml') return 'yaml'
  if (ext === 'toml') return 'ini'
  if (ext === 'properties' || ext === 'cfg') return 'ini'
  return 'plaintext'
}

type Props = {
  instanceId: string
  serverRunning?: boolean
}

export function FileManager({ instanceId, serverRunning }: Props) {
  const [cwd, setCwd] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [deletePath, setDeletePath] = useState<string | null>(null)
  const [mkdirName, setMkdirName] = useState('')
  const [dragging, setDragging] = useState(false)

  const crumbs = useMemo(() => {
    if (!cwd) return [{ label: 'root', path: '' }]
    const parts = cwd.split('/').filter(Boolean)
    const out = [{ label: 'root', path: '' }]
    let acc = ''
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p
      out.push({ label: p, path: acc })
    }
    return out
  }, [cwd])

  const loadDir = useCallback(
    async (path: string) => {
      try {
        const q = path ? `?path=${encodeURIComponent(path)}` : ''
        const data = await apiGet<{ entries: FileEntry[] }>(
          `/instances/${instanceId}/files${q}`
        )
        setEntries(data.entries ?? [])
        setCwd(path)
        setSelected(null)
        setContent('')
        setDirty(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'List failed')
      }
    },
    [instanceId]
  )

  useEffect(() => {
    void loadDir('')
  }, [loadDir])

  async function openFile(path: string) {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    if (!TEXT_EXT.has(ext)) {
      toast.message('Binary file — download not implemented in panel')
      return
    }
    try {
      const data = await apiGet<{ content: string }>(
        `/instances/${instanceId}/files/content?path=${encodeURIComponent(path)}`
      )
      setSelected(path)
      setContent(data.content)
      setDirty(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Read failed')
    }
  }

  async function save() {
    if (!selected) return
    try {
      await apiPut(`/instances/${instanceId}/files/content`, {
        path: selected,
        content
      })
      setDirty(false)
      toast.success('Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function uploadFiles(files: FileList | File[], basePath = cwd) {
    const fd = new FormData()
    for (const file of Array.from(files)) {
      const rel =
        'webkitRelativePath' in file && file.webkitRelativePath
          ? file.webkitRelativePath
          : file.name
      fd.append('files', file, rel)
    }
    fd.append('path', basePath)
    try {
      const res = await fetch(
        clientApiUrl(`/instances/${instanceId}/files/upload`),
        {
          method: 'POST',
          headers: authOnlyHeaders(),
          body: fd
        }
      )
      if (!res.ok) throw new Error(await res.text())
      toast.success('Upload complete')
      await loadDir(cwd)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function createDir() {
    if (!mkdirName.trim()) return
    try {
      await fetch(clientApiUrl(`/instances/${instanceId}/files/mkdir`), {
        method: 'POST',
        headers: {
          ...authOnlyHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: cwd ? `${cwd}/${mkdirName.trim()}` : mkdirName.trim()
        })
      }).then(async r => {
        if (!r.ok) throw new Error(await r.text())
      })
      setMkdirName('')
      await loadDir(cwd)
      toast.success('Folder created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'mkdir failed')
    }
  }

  async function confirmDelete() {
    if (!deletePath) return
    try {
      await apiDelete(
        `/instances/${instanceId}/files?path=${encodeURIComponent(deletePath)}`
      )
      toast.success('Deleted')
      setDeletePath(null)
      if (selected === deletePath) {
        setSelected(null)
        setContent('')
      }
      await loadDir(cwd)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      {serverRunning && selected?.endsWith('server.properties') ? (
        <Alert>
          <AlertTitle>Server is running</AlertTitle>
          <AlertDescription>
            Changes to server.properties may need a restart to take effect.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className='flex flex-wrap items-center gap-1 text-sm'>
        {crumbs.map((c, i) => (
          <div key={c.path || 'root'} className='flex items-center gap-1'>
            {i > 0 ? (
              <ChevronRightIcon className='size-3.5 text-muted-foreground' />
            ) : null}
            <button
              type='button'
              className='rounded px-1 hover:bg-muted'
              onClick={() => void loadDir(c.path)}
            >
              {c.label}
            </button>
          </div>
        ))}
      </div>

      <div className='grid gap-4 lg:grid-cols-[280px_1fr]'>
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Files</CardTitle>
            <CardDescription>Browse instance data.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground transition-colors',
                dragging && 'border-primary bg-muted/50'
              )}
              onDragOver={e => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setDragging(false)
                if (e.dataTransfer.files?.length) {
                  void uploadFiles(e.dataTransfer.files)
                }
              }}
            >
              <UploadIcon className='size-4' />
              Drop files here or
              <label className='cursor-pointer underline'>
                browse
                <input
                  type='file'
                  className='hidden'
                  multiple
                  onChange={e => {
                    if (e.target.files?.length) void uploadFiles(e.target.files)
                  }}
                />
              </label>
              <label className='cursor-pointer underline'>
                upload folder
                <input
                  type='file'
                  className='hidden'
                  // @ts-expect-error webkitdirectory is non-standard
                  webkitdirectory=''
                  multiple
                  onChange={e => {
                    if (e.target.files?.length) void uploadFiles(e.target.files)
                  }}
                />
              </label>
            </div>
            <div className='flex gap-2'>
              <Input
                placeholder='New folder'
                value={mkdirName}
                onChange={e => setMkdirName(e.target.value)}
              />
              <Button
                type='button'
                size='icon'
                variant='outline'
                onClick={() => void createDir()}
              >
                <FolderPlusIcon />
              </Button>
            </div>
            <Separator />
            <ScrollArea className='h-80'>
              <ul className='flex flex-col gap-0.5'>
                {entries.map(e => (
                  <li key={e.path}>
                    <div className='flex items-center gap-1'>
                      <button
                        type='button'
                        className={cn(
                          'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                          selected === e.path && 'bg-muted'
                        )}
                        onClick={() => {
                          if (e.isDir) void loadDir(e.path)
                          else void openFile(e.path)
                        }}
                      >
                        {e.isDir ? (
                          <FolderIcon className='size-4 shrink-0' />
                        ) : (
                          <FileIcon className='size-4 shrink-0' />
                        )}
                        <span className='truncate'>{e.name}</span>
                      </button>
                      <Button
                        type='button'
                        size='icon-xs'
                        variant='ghost'
                        onClick={() => setDeletePath(e.path)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </li>
                ))}
                {entries.length === 0 ? (
                  <li className='px-2 text-sm text-muted-foreground'>Empty</li>
                ) : null}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className='min-h-[28rem]'>
          <CardHeader className='flex flex-row items-center justify-between gap-2 pb-3'>
            <div>
              <CardTitle className='text-base'>Editor</CardTitle>
              <CardDescription className='font-mono text-xs'>
                {selected ?? 'Select a text file'}
              </CardDescription>
            </div>
            <Button
              type='button'
              size='sm'
              disabled={!selected || !dirty}
              onClick={() => void save()}
            >
              Save
            </Button>
          </CardHeader>
          <CardContent className='h-[24rem] overflow-hidden rounded-md border'>
            {selected ? (
              <MonacoEditor
                height='100%'
                theme='vs-dark'
                language={languageFor(selected)}
                value={content}
                onChange={v => {
                  setContent(v ?? '')
                  setDirty(true)
                }}
                options={{
                  minimap: { enabled: false },
                  fontFamily: 'var(--font-geist-mono)',
                  fontSize: 13,
                  scrollBeyondLastLine: false
                }}
              />
            ) : (
              <div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
                Open a text file to edit
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={Boolean(deletePath)}
        onOpenChange={o => !o && setDeletePath(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete path?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <code>{deletePath}</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

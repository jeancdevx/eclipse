'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  loaderVersionLabel,
  type Loader,
  type MemoryPreset
} from '@eclipse/shared'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { apiGet, apiPost } from '@/lib/client-api'

type Caps = {
  maxHeap?: string
  maxHeapMb?: number
  presets?: Record<string, { memory: string; fits: boolean }>
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateInstanceDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('Survival Mods')
  const [slug, setSlug] = useState('survival-mods')
  const [loader, setLoader] = useState<Loader>('FABRIC')
  const [mcVersion, setMcVersion] = useState('1.21.1')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [preset, setPreset] = useState<MemoryPreset>('light')
  const [pending, setPending] = useState(false)
  const [caps, setCaps] = useState<Caps | null>(null)

  const versionLabel = loaderVersionLabel(loader)

  useEffect(() => {
    if (!open) return
    void apiGet<Caps>('/server/capabilities')
      .then(setCaps)
      .catch(() => setCaps(null))
  }, [open])

  async function submit() {
    setPending(true)
    try {
      await apiPost('/instances', {
        name,
        slug,
        loader,
        mcVersion,
        memoryPreset: preset,
        ...(loaderVersion.trim()
          ? { loaderVersion: loaderVersion.trim() }
          : {})
      })
      const fits = caps?.presets?.[preset]?.fits
      toast.success(
        fits === false
          ? `Instance created (heap will be capped to ~${caps?.maxHeap ?? 'host max'} on this VM)`
          : 'Instance created'
      )
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setPending(false)
    }
  }

  function presetLabel(key: MemoryPreset, label: string) {
    const info = caps?.presets?.[key]
    if (!info) return label
    return info.fits ? label : `${label} · capped to ${caps?.maxHeap}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New instance</DialogTitle>
          <DialogDescription>
            Creates a new world profile. JVM heap is limited by game-host RAM
            {caps?.maxHeap ? ` (max ~${caps.maxHeap} on this host)` : ''}.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='inst-name'>Name</FieldLabel>
            <Input
              id='inst-name'
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='inst-slug'>Slug</FieldLabel>
            <Input
              id='inst-slug'
              value={slug}
              onChange={e => setSlug(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Loader</FieldLabel>
            <Select
              value={loader}
              onValueChange={v => {
                setLoader(v as Loader)
                setLoaderVersion('')
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='VANILLA'>Vanilla</SelectItem>
                  <SelectItem value='PAPER'>Paper</SelectItem>
                  <SelectItem value='FABRIC'>Fabric</SelectItem>
                  <SelectItem value='FORGE'>Forge</SelectItem>
                  <SelectItem value='NEOFORGE'>NeoForge</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor='inst-version'>Minecraft version</FieldLabel>
            <Input
              id='inst-version'
              value={mcVersion}
              onChange={e => setMcVersion(e.target.value)}
            />
          </Field>
          {versionLabel ? (
            <Field>
              <FieldLabel htmlFor='inst-loader-version'>
                {versionLabel}
              </FieldLabel>
              <Input
                id='inst-loader-version'
                placeholder='e.g. 21.1.228 (empty = latest)'
                value={loaderVersion}
                onChange={e => setLoaderVersion(e.target.value)}
              />
              <FieldDescription>
                Leave empty to let itzg pick the latest build for this Minecraft
                version. Modpacks often need an exact pin.
              </FieldDescription>
            </Field>
          ) : null}
          <Field>
            <FieldLabel>Memory</FieldLabel>
            <Select
              value={preset}
              onValueChange={v => setPreset(v as MemoryPreset)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='light'>
                    {presetLabel('light', 'light (8G)')}
                  </SelectItem>
                  <SelectItem value='standard'>
                    {presetLabel('standard', 'standard (16G)')}
                  </SelectItem>
                  <SelectItem value='heavy'>
                    {presetLabel('heavy', 'heavy (24G)')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {caps?.presets?.[preset]?.fits === false ? (
              <FieldDescription>
                This host cannot allocate that heap. On start it will be capped
                to ~{caps.maxHeap}. Use a larger Azure VM (D8 / 32 GB) for
                16G+.
              </FieldDescription>
            ) : null}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type='button' disabled={pending} onClick={() => void submit()}>
            {pending ? <Spinner data-icon='inline-start' /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

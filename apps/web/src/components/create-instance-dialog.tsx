'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { Loader, MemoryPreset } from '@eclipse/shared'

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
import { apiPost } from '@/lib/client-api'

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
  const [preset, setPreset] = useState<MemoryPreset>('light')
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      await apiPost('/instances', {
        name,
        slug,
        loader,
        mcVersion,
        memoryPreset: preset
      })
      toast.success('Instance created')
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New instance</DialogTitle>
          <DialogDescription>
            Creates a new world profile under the instances data directory.
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
              onValueChange={v => setLoader(v as Loader)}
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
                  <SelectItem value='light'>light (8G · local-safe)</SelectItem>
                  <SelectItem value='standard'>standard (16G)</SelectItem>
                  <SelectItem value='heavy'>heavy (24G · Azure)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
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

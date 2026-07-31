'use client'

import { UploadIcon } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

type Provider = 'modrinth' | 'curseforge'

type Props = {
  provider: Provider
  packUrl: string
  packVersion: string
  excludeFiles: string
  cfConfigured: boolean
  onProviderChange: (provider: Provider) => void
  onPackUrlChange: (value: string) => void
  onPackVersionChange: (value: string) => void
  onExcludeFilesChange: (value: string) => void
  onInstall: () => void
  onSaveExcludes: () => void
  onUploadPack: (file: File) => void
}

export function ModpackPanel({
  provider,
  packUrl,
  packVersion,
  excludeFiles,
  cfConfigured,
  onProviderChange,
  onPackUrlChange,
  onPackVersionChange,
  onExcludeFilesChange,
  onInstall,
  onSaveExcludes,
  onUploadPack
}: Props) {
  return (
    <div className='flex flex-col gap-4'>
      {!cfConfigured && provider === 'curseforge' ? (
        <Alert>
          <AlertTitle>CurseForge API key missing</AlertTitle>
          <AlertDescription>
            Set <code>CF_API_KEY</code> in the repo root <code>.env</code>.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Install from URL</CardTitle>
          <CardDescription>
            Uses itzg Modrinth / Auto CurseForge installers on next start.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Provider</FieldLabel>
              <Select
                value={provider}
                onValueChange={(v) => onProviderChange(v as Provider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='modrinth'>Modrinth</SelectItem>
                    <SelectItem value='curseforge'>CurseForge</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='pack-url'>URL or slug</FieldLabel>
              <Input
                id='pack-url'
                value={packUrl}
                onChange={(e) => onPackUrlChange(e.target.value)}
                placeholder='https://modrinth.com/modpack/…'
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='pack-ver'>Version (optional)</FieldLabel>
              <Input
                id='pack-ver'
                value={packVersion}
                onChange={(e) => onPackVersionChange(e.target.value)}
              />
              <FieldDescription>
                Leave blank for latest compatible.
              </FieldDescription>
            </Field>
            {provider === 'modrinth' ? (
              <Field>
                <FieldLabel htmlFor='pack-exclude'>
                  Exclude files (server)
                </FieldLabel>
                <Input
                  id='pack-exclude'
                  value={excludeFiles}
                  onChange={(e) => onExcludeFilesChange(e.target.value)}
                  placeholder='missingmodschecker,sodium,iris'
                />
                <FieldDescription>
                  Partial names for itzg <code>MODRINTH_EXCLUDE_FILES</code>.
                  Needed for client-only / GUI mods that crash headless servers.
                </FieldDescription>
              </Field>
            ) : null}
            <div className='flex flex-wrap gap-2'>
              <Button type='button' onClick={onInstall}>
                Install
              </Button>
              {provider === 'modrinth' ? (
                <Button type='button' variant='outline' onClick={onSaveExcludes}>
                  Save excludes only
                </Button>
              ) : null}
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Upload pack</CardTitle>
          <CardDescription>
            Drop a <code>.mrpack</code> or CurseForge zip.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className='flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-8 text-sm text-muted-foreground hover:bg-muted/40'>
            <UploadIcon className='size-5' />
            Choose pack file
            <input
              type='file'
              className='hidden'
              accept='.mrpack,.zip'
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onUploadPack(f)
              }}
            />
          </label>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { Trash2Icon, UploadIcon } from 'lucide-react'

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

type Props = {
  mods: string[]
  onUpload: (file: File) => void
  onDelete: (name: string) => void
}

export function ModsPanel({ mods, onUpload, onDelete }: Props) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between'>
        <div>
          <CardTitle>JAR mods</CardTitle>
          <CardDescription>
            Files in <code>mods/</code> for this instance.
          </CardDescription>
        </div>
        <Button type='button' size='sm' asChild>
          <label className='cursor-pointer'>
            <UploadIcon data-icon='inline-start' />
            Upload
            <input
              type='file'
              className='hidden'
              accept='.jar'
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onUpload(f)
              }}
            />
          </label>
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead className='w-24 text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mods.map((m) => (
              <TableRow key={m}>
                <TableCell className='font-mono text-xs'>{m}</TableCell>
                <TableCell className='text-right'>
                  <Button
                    type='button'
                    size='icon-sm'
                    variant='ghost'
                    onClick={() => onDelete(m)}
                  >
                    <Trash2Icon />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {mods.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className='text-muted-foreground'>
                  No jars yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

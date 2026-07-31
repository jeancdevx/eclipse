'use client'

import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Instance } from '@/lib/types'

export function InstanceHeader({ instance }: { instance: Instance }) {
  return (
    <div className='flex flex-wrap items-start justify-between gap-3'>
      <div className='flex flex-col gap-2'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='w-fit'
          asChild
        >
          <Link href='/dashboard/instances'>
            <ArrowLeftIcon data-icon='inline-start' />
            Instances
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {instance.name}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {instance.loader} {instance.mcVersion}
          </p>
        </div>
      </div>
      <div className='flex gap-2'>
        <Badge variant='outline'>{instance.status}</Badge>
        {instance.isActive ? <Badge>active</Badge> : null}
      </div>
    </div>
  )
}

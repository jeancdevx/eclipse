import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { AppSidebar } from '@/components/app-sidebar'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from '@/components/ui/sidebar'

import { auth } from '@/lib/auth'

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  if (process.env.AUTH_DEV_BYPASS !== 'true' && !session) {
    redirect('/')
  }

  return (
    <SidebarProvider>
      <AppSidebar userLabel={session?.user?.email ?? 'dev bypass'} />
      <SidebarInset>
        <header className='flex h-14 shrink-0 items-center gap-2 border-b px-4'>
          <SidebarTrigger className='-ml-1' />
          <Separator
            orientation='vertical'
            className='mr-2 data-[orientation=vertical]:h-4'
          />
          <p className='text-sm text-muted-foreground'>Minecraft control plane</p>
        </header>
        <div className='flex flex-1 flex-col gap-6 p-4 md:p-6'>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

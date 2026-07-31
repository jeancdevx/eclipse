'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FolderOpenIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MoonIcon,
  ServerIcon,
  SettingsIcon,
  SunIcon
} from 'lucide-react'
import { useTheme } from 'next-themes'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

const nav = [
  { title: 'Overview', href: '/dashboard', icon: LayoutDashboardIcon },
  { title: 'Instances', href: '/dashboard/instances', icon: ServerIcon },
  { title: 'Files', href: '/dashboard/files', icon: FolderOpenIcon },
  { title: 'Settings', href: '/dashboard/settings', icon: SettingsIcon }
]

export function AppSidebar({
  userLabel
}: {
  userLabel?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  async function signOut() {
    await authClient.signOut()
    router.push('/')
  }

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link href='/dashboard'>
                <div className='flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground'>
                  <span className='font-mono text-xs font-semibold'>Ec</span>
                </div>
                <div className='flex flex-col gap-0.5 leading-none'>
                  <span className='font-semibold'>Eclipse</span>
                  <span className='text-xs text-muted-foreground'>
                    Control plane
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Panel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(item => {
                const active =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className='flex items-center justify-between gap-2 px-2 group-data-[collapsible=icon]:justify-center'>
          <span className='truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden'>
            {userLabel ?? 'local'}
          </span>
          <div className='flex items-center gap-1'>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label='Toggle theme'
            >
              <SunIcon className='dark:hidden' />
              <MoonIcon className='hidden dark:block' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              onClick={() => void signOut()}
              aria-label='Sign out'
            >
              <LogOutIcon />
            </Button>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

import { Providers } from '@/components/providers'

import './globals.css'

export const metadata: Metadata = {
  title: 'Eclipse',
  description: 'Minecraft control plane'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang='en'
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className='min-h-screen font-sans antialiased'>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

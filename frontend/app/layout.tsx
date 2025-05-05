import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import MatrixBackground from '@/components/MatrixBackground'

const inter = Inter({ subsets: ['latin'] })

import { headers } from 'next/headers' // added
import ContextProvider from '@/context'

export const metadata: Metadata = {
  title: 'Gazometer',
  description: 'Private and verifiable computing platform',
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {


  const headersObj = await headers();
  const cookies = headersObj.get('cookie')

  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-white`}>
        <MatrixBackground />
        <Navbar />
        <ContextProvider cookies={cookies}>
          <main className="relative z-10">{children}</main>
        </ContextProvider>
      </body>
    </html>
  )
}
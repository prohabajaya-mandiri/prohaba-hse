'use client'

import { SessionProvider } from 'next-auth/react'
import DialogProvider from './DialogProvider'

export function Providers({ children }) {
  return (
    <SessionProvider>
      <DialogProvider>
        {children}
      </DialogProvider>
    </SessionProvider>
  )
}

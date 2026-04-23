'use client'

import { createContext, useContext } from 'react'

export type IdleSessionContextValue = {
  remainingMs: number
  idleLimitMs: number
  extendSession: () => void
  isWarning: boolean
}

const IdleSessionContext = createContext<IdleSessionContextValue | null>(null)

type IdleSessionProviderProps = {
  value: IdleSessionContextValue
  children: React.ReactNode
}

export function IdleSessionProvider({ value, children }: IdleSessionProviderProps) {
  return <IdleSessionContext.Provider value={value}>{children}</IdleSessionContext.Provider>
}

export function useIdleSession() {
  const ctx = useContext(IdleSessionContext)
  if (!ctx) {
    throw new Error('useIdleSession must be used within an IdleSessionProvider')
  }
  return ctx
}

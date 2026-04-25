'use client'

import { useCallback, useRef, useState } from 'react'

type UseSingleSubmitOptions = {
  minLockMs?: number
}

export type SingleSubmitRunner = <T>(fn: () => Promise<T>) => Promise<T | undefined>

export function useSingleSubmit(options?: UseSingleSubmitOptions): {
  isSubmitting: boolean
  run: SingleSubmitRunner
} {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inFlightRef = useRef(false)
  const minLockMs = Math.max(0, options?.minLockMs ?? 0)

  const run = useCallback<SingleSubmitRunner>(async <T,>(fn: () => Promise<T>) => {
    if (inFlightRef.current) return undefined

    inFlightRef.current = true
    setIsSubmitting(true)
    const startedAt = Date.now()

    try {
      return await fn()
    } finally {
      const elapsed = Date.now() - startedAt
      const remaining = minLockMs - elapsed
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, remaining)
        })
      }
      inFlightRef.current = false
      setIsSubmitting(false)
    }
  }, [minLockMs])

  return { isSubmitting, run }
}

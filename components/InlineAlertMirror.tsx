'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type InlineAlertMirrorProps = {
  message: string
  variant: 'success' | 'error'
}

export default function InlineAlertMirror({ message, variant }: InlineAlertMirrorProps) {
  const inlineRef = useRef<HTMLDivElement | null>(null)
  const [isInlineVisible, setIsInlineVisible] = useState(true)

  useEffect(() => {
    const target = inlineRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInlineVisible(entry.isIntersecting)
      },
      {
        root: null,
        threshold: 0.25,
      }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [message])

  const inlineClassName = variant === 'success' ? 'erp-alert-success' : 'erp-alert-error'
  const floatingClassName = useMemo(() => {
    if (variant === 'success') {
      return 'fixed left-1/2 top-3 z-[70] w-[min(92vw,56rem)] -translate-x-1/2 rounded-lg border border-emerald-300 bg-emerald-50/95 px-3 py-2 text-sm font-semibold text-emerald-900 shadow-lg backdrop-blur-sm'
    }
    return 'fixed left-1/2 top-3 z-[70] w-[min(92vw,56rem)] -translate-x-1/2 rounded-lg border border-red-300 bg-red-50/95 px-3 py-2 text-sm font-semibold text-red-900 shadow-lg backdrop-blur-sm'
  }, [variant])

  return (
    <>
      <div ref={inlineRef} className={inlineClassName}>
        {message}
      </div>
      {!isInlineVisible ? (
        <div className={floatingClassName} role="status" aria-live="polite">
          {message}
        </div>
      ) : null}
    </>
  )
}

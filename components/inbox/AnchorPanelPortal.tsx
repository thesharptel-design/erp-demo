'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  anchorRef: RefObject<HTMLElement | null>
  /** When set, panel right edge aligns to this element's right (page content line), clamped to the viewport. */
  contentAlignRef?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: React.ReactNode
  labelledBy?: string
}

function measure(anchor: HTMLElement, contentAlignEl: HTMLElement | null) {
  const margin = 8
  const vw = document.documentElement.clientWidth || window.innerWidth
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(380, Math.max(280, vw - margin * 2))
  const alignRight = contentAlignEl ? contentAlignEl.getBoundingClientRect().right : vw
  const targetRight = Math.min(alignRight, vw) - margin
  let left = targetRight - width
  left = Math.max(margin, Math.min(left, vw - width - margin))
  const spaceBelow = window.innerHeight - rect.bottom - margin
  const spaceAbove = rect.top - margin
  const preferBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove
  const maxHeight = Math.min(
    Math.floor(window.innerHeight * 0.7),
    Math.max(160, preferBelow ? spaceBelow : spaceAbove)
  )
  const top = preferBelow ? rect.bottom + margin : Math.max(margin, rect.top - maxHeight - margin)
  return { top, left, width, maxHeight }
}

export function AnchorPanelPortal({ anchorRef, contentAlignRef, open, onClose, children, labelledBy }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') {
      setCoords(null)
      return
    }
    const el = anchorRef.current
    if (!el) {
      setCoords(null)
      return
    }
    setCoords(measure(el, contentAlignRef?.current ?? null))
  }, [open, anchorRef, contentAlignRef])

  useEffect(() => {
    if (!open) return
    function reposition() {
      const el = anchorRef.current
      if (!el) return
      setCoords(measure(el, contentAlignRef?.current ?? null))
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, anchorRef, contentAlignRef])

  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onPointerDown(e: MouseEvent | PointerEvent) {
      const panel = panelRef.current
      const anchor = anchorRef.current
      const t = e.target as Node | null
      if (!t) return
      if (anchor?.contains(t)) return
      if (panel?.contains(t)) return
      onClose()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open, onClose, anchorRef])

  if (!open || !coords || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelledBy}
      className="fixed z-[100] box-border max-w-[calc(100vw-16px)] rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
      style={{
        top: coords.top,
        left: coords.left,
        width: coords.width,
        maxHeight: coords.maxHeight,
      }}
    >
      {children}
    </div>,
    document.body
  )
}

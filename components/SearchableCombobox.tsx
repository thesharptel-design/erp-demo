'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type ComboboxOption = {
  value: string
  label: string
  keywords?: string[]
  disabled?: boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  /** Trigger button (e.g. smaller text in table header filters). */
  buttonClassName?: string
  /** Dropdown panel: default avoids 1-character-per-line wrap in narrow table cells. */
  dropdownClassName?: string
  /** Scrollable list region (max-height + overflow-y). */
  listMaxHeightClass?: string
  /** Allow committing the current search text as the value (inline edit / free text). */
  creatable?: boolean
  /** When false, the built-in 「선택 안 함」(clear to empty) row is hidden — use when options already include an empty value. */
  showClearOption?: boolean
  /** auto: open upward if viewport space below the trigger is tight (e.g. table footers). */
  dropdownPlacement?: 'auto' | 'below' | 'above'
  /** Pressing Enter in search input applies current query text as value. */
  enterToApplyQuery?: boolean
}

export default function SearchableCombobox({
  value,
  onChange,
  options,
  placeholder = '검색 또는 선택',
  emptyText = '검색 결과가 없습니다.',
  disabled = false,
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  listMaxHeightClass = 'max-h-72 overflow-y-auto',
  creatable = false,
  showClearOption = true,
  dropdownPlacement = 'below',
  enterToApplyQuery = true,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isPortalReady, setIsPortalReady] = useState(false)
  const [panelLayout, setPanelLayout] = useState<{
    left: number
    top?: number
    bottom?: number
    minWidth: number
    maxWidth: number
    listMaxHeight: number
  } | null>(null)

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value]
  )

  const filteredOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return options
    return options.filter((opt) => {
      const target = [opt.label, ...(opt.keywords ?? [])].join(' ').toLowerCase()
      return target.includes(keyword)
    })
  }, [options, query])

  useEffect(() => {
    setIsPortalReady(true)
  }, [])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (!wrapperRef.current) return
      if (wrapperRef.current.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPanelLayout(null)
      return
    }

    const updatePlacement = () => {
      const btn = buttonRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const margin = 8
      const gap = 4
      const reserveInputPx = 56
      const minListHeight = 120
      const maxListHeight = 360
      const desiredPanelPx = reserveInputPx + minListHeight

      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - margin)
      const spaceAbove = Math.max(0, rect.top - margin)
      const placeAbove =
        dropdownPlacement === 'above' ||
        (dropdownPlacement === 'auto' && spaceBelow < desiredPanelPx && spaceAbove > spaceBelow)

      const effectiveSpace = placeAbove ? spaceAbove : spaceBelow
      const listMaxHeight = Math.max(minListHeight, Math.min(maxListHeight, effectiveSpace - reserveInputPx))

      const minWidth = Math.max(rect.width, 168)
      const maxWidth = Math.max(minWidth, Math.min(352, window.innerWidth - margin * 2))
      let left = rect.left
      if (left + maxWidth > window.innerWidth - margin) left = window.innerWidth - margin - maxWidth
      if (left < margin) left = margin

      setPanelLayout({
        left,
        top: placeAbove ? undefined : rect.bottom + gap,
        bottom: placeAbove ? window.innerHeight - rect.top + gap : undefined,
        minWidth,
        maxWidth,
        listMaxHeight,
      })
    }

    updatePlacement()
    window.addEventListener('scroll', updatePlacement, true)
    window.addEventListener('resize', updatePlacement)
    return () => {
      window.removeEventListener('scroll', updatePlacement, true)
      window.removeEventListener('resize', updatePlacement)
    }
  }, [open, dropdownPlacement])

  const commitValue = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
    setQuery('')
  }

  const dropdownNode =
    open && !disabled && panelLayout ? (
      <div
        ref={panelRef}
        className={`fixed z-[80] w-max rounded-lg border border-gray-200 bg-white shadow-lg ${dropdownClassName}`}
        style={{
          left: panelLayout.left,
          top: panelLayout.top,
          bottom: panelLayout.bottom,
          minWidth: panelLayout.minWidth,
          maxWidth: panelLayout.maxWidth,
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
              setQuery('')
              return
            }
            if (e.key !== 'Enter') return
            e.preventDefault()
            const typed = query.trim()
            if (!typed) return

            const exact = options.find((opt) => !opt.disabled && (opt.value === typed || opt.label === typed))
            if (exact) {
              commitValue(exact.value)
              return
            }
            if (creatable || enterToApplyQuery) {
              commitValue(typed)
            }
          }}
          placeholder={placeholder}
          className="w-full border-b border-gray-100 px-3 py-2 text-sm outline-none"
        />
        <ul
          className={`py-1 overflow-y-auto overscroll-contain ${listMaxHeightClass}`}
          style={{ WebkitOverflowScrolling: 'touch', maxHeight: `${panelLayout.listMaxHeight}px` }}
          onWheel={(e) => e.stopPropagation()}
        >
          {showClearOption ? (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => {
                  commitValue('')
                }}
              >
                선택 안 함
              </button>
            </li>
          ) : null}
          {creatable && query.trim() && !filteredOptions.some((o) => o.value === query.trim()) ? (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm font-bold text-blue-700 hover:bg-blue-50"
                onClick={() => {
                  commitValue(query.trim())
                }}
              >
                「{query.trim()}」로 적용
              </button>
            </li>
          ) : null}
          {filteredOptions.length === 0 && !(creatable && query.trim()) ? (
            <li className="px-3 py-2 text-sm text-gray-400">{emptyText}</li>
          ) : filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  disabled={opt.disabled}
                  className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
                  onClick={() => {
                    if (opt.disabled) return
                    commitValue(opt.value)
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))
          ) : null}
        </ul>
      </div>
    ) : null

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 disabled:bg-gray-100 disabled:text-gray-500 ${buttonClassName}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {(selectedOption?.label ?? value.trim()) || placeholder}
      </button>
      {isPortalReady && dropdownNode ? createPortal(dropdownNode, document.body) : null}
    </div>
  )
}

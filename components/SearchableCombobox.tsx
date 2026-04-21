'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

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
  /** Scrollable list region (max-height + overflow-y). */
  listMaxHeightClass?: string
  /** Allow committing the current search text as the value (inline edit / free text). */
  creatable?: boolean
  /** When false, the built-in 「선택 안 함」(clear to empty) row is hidden — use when options already include an empty value. */
  showClearOption?: boolean
}

export default function SearchableCombobox({
  value,
  onChange,
  options,
  placeholder = '검색 또는 선택',
  emptyText = '검색 결과가 없습니다.',
  disabled = false,
  className = '',
  listMaxHeightClass = 'max-h-72 overflow-y-auto',
  creatable = false,
  showClearOption = true,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

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
    const onClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 disabled:bg-gray-100 disabled:text-gray-500"
        onClick={() => setOpen((prev) => !prev)}
      >
        {(selectedOption?.label ?? value.trim()) || placeholder}
      </button>
      {open && !disabled && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full border-b border-gray-100 px-3 py-2 text-sm outline-none"
          />
          <ul
            className={`py-1 overflow-y-auto overscroll-contain ${listMaxHeightClass}`}
            style={{ WebkitOverflowScrolling: 'touch' }}
            onWheel={(e) => e.stopPropagation()}
          >
            {showClearOption ? (
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                    setQuery('')
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
                    onChange(query.trim())
                    setOpen(false)
                    setQuery('')
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
                      onChange(opt.value)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              ))
            ) : null}
          </ul>
        </div>
      )}
    </div>
  )
}

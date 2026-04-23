'use client'

import { Calendar } from 'lucide-react'
import {
  executionDateForDb,
  executionDateInputDisplay,
  filterExecutionDateDigits,
  normalizeExecutionDateOnBlur,
} from '@/lib/execution-date-input'

type ExecutionDateHybridInputProps = {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  /** 비어 있으면 브라우저 기본 메시지(이 입력란을 작성하세요) */
  required?: boolean
  placeholder?: string
  /** 달력(네이티브 date) 접근성 라벨 */
  calendarLabel?: string
  inputClassName?: string
  /** 달력 아이콘 영역(클릭 시 OS 달력 앵커) — 기본은 정사각 버튼 톤 */
  buttonClassName?: string
}

export default function ExecutionDateHybridInput({
  value,
  onChange,
  disabled,
  required = true,
  placeholder,
  calendarLabel = '달력에서 날짜 선택',
  inputClassName = 'w-full min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm font-bold tracking-wide',
  buttonClassName = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
}: ExecutionDateHybridInputProps) {
  const isoForPicker = executionDateForDb(value) ?? ''

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {/* 네이티브 date 입력을 아이콘 위에 겹쳐 두어 OS 달력이 이 근처에 뜨게 함 (fixed 숨김 입력은 화면 구석에 앵커됨) */}
      <div
        className={`group relative shrink-0 ${buttonClassName} ${
          disabled ? 'pointer-events-none cursor-not-allowed opacity-50' : ''
        }`}
      >
        <span className="pointer-events-none flex h-full w-full items-center justify-center">
          <Calendar className="h-4 w-4 text-gray-700" aria-hidden />
        </span>
        <input
          type="date"
          disabled={disabled}
          aria-label={calendarLabel}
          title={calendarLabel}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          value={isoForPicker}
          onChange={(e) => {
            const v = e.target.value
            if (v) onChange(v)
          }}
        />
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        maxLength={8}
        disabled={disabled}
        required={required && !disabled}
        value={executionDateInputDisplay(value)}
        onChange={(e) => onChange(filterExecutionDateDigits(e.target.value))}
        onBlur={() => onChange(normalizeExecutionDateOnBlur(value))}
        className={inputClassName}
      />
    </div>
  )
}

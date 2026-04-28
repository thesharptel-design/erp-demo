import type { ReactNode } from 'react'

/** 기안/출고 작성·모달 상단 오류 — 토스트와 동일 톤(빨강·굵은 테두리) */
export function DraftFormErrorBanner({ message }: { message: string }) {
  if (!message.trim()) return null
  return (
    <div
      role="alert"
      className="whitespace-pre-line rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm font-black text-red-800 shadow-[2px_2px_0_0_rgba(0,0,0,0.06)]"
    >
      {message}
    </div>
  )
}

/** 결재권·창고 등 안내 — 동일 계열(앰버·굵은 테두리) */
export function DraftFormWarningBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.06)]">
      {children}
    </div>
  )
}

/** 자동 저장 안내 등 정보성 배너 */
export function DraftFormInfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-blue-400 bg-blue-50 px-4 py-2 text-xs font-black text-blue-900 shadow-[2px_2px_0_0_rgba(0,0,0,0.06)]">
      {children}
    </div>
  )
}

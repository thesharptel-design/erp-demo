'use client'

type ApprovalCloseButtonProps = {
  fallbackHref?: string
  className?: string
}

export default function ApprovalCloseButton({
  fallbackHref = '/approvals',
  className = 'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50',
}: ApprovalCloseButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
          window.close()
          return
        }
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back()
          return
        }
        if (typeof window !== 'undefined') window.location.href = fallbackHref
      }}
    >
      닫기
    </button>
  )
}

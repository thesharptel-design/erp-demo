/**
 * 견적서 `quotes.status`를 통합 결재문서함과 동일한 뱃지 톤·문구 체계로 표시합니다.
 * (견적은 결재선이 없으므로 DB 상태값만 매핑합니다.)
 */
const pill = (classes: string) =>
  `inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black border ${classes}`

export function getQuoteStatusUnifiedBadge(status: string | null | undefined): {
  label: string
  className: string
} {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
  if (s === 'draft') {
    return { label: '임시저장', className: pill('bg-gray-100 text-gray-500 font-bold border-gray-200') }
  }
  if (s === 'pending') {
    return { label: '결재,협조진행중', className: pill('bg-blue-50 text-blue-900 border-blue-300 font-black') }
  }
  if (s === 'approved') {
    return { label: '최종승인', className: pill('bg-green-100 text-green-800 border-green-400 font-black') }
  }
  if (s === 'cancelled' || s === 'rejected') {
    return { label: '반려', className: pill('bg-red-50 text-red-700 border-red-300 font-black') }
  }
  return {
    label: status?.trim() ? String(status) : '—',
    className: pill('bg-gray-100 text-gray-600 font-bold border-gray-200'),
  }
}

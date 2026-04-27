/**
 * 입출고 비고 표시용. 창고이동 RPC는 행의 warehouse_id가 출발/도착 각각을 가리키므로
 * 접미사만 있던 문구를 실제 창고명과 함께 보여준다.
 */
export function formatTransactionRemarksForDisplay(
  remarks: string | null,
  warehouseName: string | null | undefined
): string {
  const raw = (remarks ?? '').trim()
  const wh = (warehouseName ?? '').trim() || '—'

  if (/\(출발창고\)\s*$/.test(raw)) {
    const base = raw.replace(/\s*\(출발창고\)\s*$/, '').trim() || '창고이동'
    return `${base} · 출발: ${wh}`
  }
  if (/\(도착창고\)\s*$/.test(raw)) {
    const base = raw.replace(/\s*\(도착창고\)\s*$/, '').trim() || '창고이동'
    return `${base} · 도착: ${wh}`
  }

  return raw
}

/**
 * 시행일자: `type="date"` 대신 숫자만 연속 입력(YYYYMMDD) + blur 시 ISO로 정규화.
 */

/** 입력 중 숫자만, 최대 8자 */
export function filterExecutionDateDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8)
}

/** YYYYMMDD → YYYY-MM-DD (달력상 불가·범위 밖이면 null) */
export function compactEightDigitsToIso(compact: string): string | null {
  if (!/^\d{8}$/.test(compact)) return null
  const y = Number(compact.slice(0, 4))
  const m = Number(compact.slice(4, 6))
  const d = Number(compact.slice(6, 8))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** DB·상신용: 유효한 완성 날짜만 ISO, 아니면 null */
export function executionDateForDb(stored: string | null | undefined): string | null {
  const t = String(stored ?? '').trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return compactEightDigitsToIso(t.replace(/-/g, ''))
  return compactEightDigitsToIso(filterExecutionDateDigits(t))
}

/** 텍스트 입력칸에 보여줄 값(ISO면 하이픈 제거) */
export function executionDateInputDisplay(stored: string | null | undefined): string {
  const t = String(stored ?? '').trim()
  if (!t) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t.replace(/-/g, '')
  return filterExecutionDateDigits(t)
}

/** blur: 8자리면 유효 시 ISO로, 아니면 숫자 부분만 유지 */
export function normalizeExecutionDateOnBlur(stored: string | null | undefined): string {
  const t = String(stored ?? '').trim()
  if (!t) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const iso = executionDateForDb(t)
    return iso ?? t
  }
  const d = filterExecutionDateDigits(t)
  if (d.length === 8) {
    const iso = compactEightDigitsToIso(d)
    return iso ?? d
  }
  return d
}

export function isCompleteValidExecutionDate(stored: string | null | undefined): boolean {
  return executionDateForDb(stored) !== null
}

/** 순수 텍스트를 TipTap/ProseMirror가 파싱할 수 있는 안전한 HTML로 감쌉니다. */
export function plainTextToSafeEditorHtml(raw: string): string {
  const t = raw.trim()
  if (!t) return '<p></p>'
  if (isProbablyRichHtml(raw)) return raw
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`
}

/** 본문이 Quill 등에서 저장된 HTML인지 대략 판별 (레거시 순수 텍스트와 구분) */
export function isProbablyRichHtml(value: string): boolean {
  const s = value.trim()
  if (!s) return false
  return /^<[\s\S]*>$/m.test(s) && /<\/?[a-z][\s\S]*>/i.test(s)
}

/** HTML에서 보이는 텍스트만 추출해 빈 본문 여부 판단 */
export function plainTextFromHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div')
    div.innerHTML = html
    return (div.textContent ?? '').replace(/\u00a0/g, ' ').trim()
  }
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isHtmlContentEffectivelyEmpty(html: string): boolean {
  return plainTextFromHtml(html).length === 0
}

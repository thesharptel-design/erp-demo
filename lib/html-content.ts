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

/**
 * 빈 `<p></p>` 는 높이 0 + margin 접힘으로 줄바꿈이 사라진 것처럼 보인다.
 * 게시판 본문 등에서 연속 빈 줄이 유지되도록 `<p><br></p>` 로 통일한다.
 */
export function normalizeEmptyParagraphsInRichHtml(html: string): string {
  return html.replace(/<p(\s[^>]*)?>(?:\s|&nbsp;|&#160;|\u00A0)*<\/p>/gi, '<p><br></p>')
}

/**
 * 텍스트가 없어도 본문으로 간주해야 하는 태그(표·미디어 등).
 * TipTap 표는 빈 셀만 있어도 `plainTextFromHtml`이 빈 문자열이 되므로, 여기서 비어 있지 않다고 처리한다.
 */
const STRUCTURAL_NON_TEXT_HTML_RE =
  /<\s*(table|img|video|iframe|canvas|svg|hr|object|embed|audio|picture)\b/i

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
  const trimmed = html.trim()
  if (!trimmed) return true
  if (STRUCTURAL_NON_TEXT_HTML_RE.test(trimmed)) return false
  return plainTextFromHtml(html).length === 0
}

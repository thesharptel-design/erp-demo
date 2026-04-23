/**
 * Groupware board shared constants/helpers.
 *
 * Follow-ups (copy into PR description when shipping):
 * - Mobile: high-density `table` should keep `overflow-x-auto` + sensible `min-w`; consider a card layout on small screens for readability (project rule).
 * - XSS: if `body_html` is rendered with `dangerouslySetInnerHTML`, sanitize on save (server route) or restrict TipTap output tags.
 * - Search: B-tree on `title` helps ordering/simple filters, not `ILIKE '%term%'`; add `pg_trgm` or full-text search when product needs real search.
 */
/** Bulletin board category slugs (stored in `board_posts.category`). */
export const BOARD_CATEGORY_VALUE_GENERAL = 'general'
export const BOARD_CATEGORY_VALUE_FREE = 'free'
export const BOARD_CATEGORY_VALUE_INFO = 'info'
export const BOARD_CATEGORY_VALUE_QNA = 'qna'
export const BOARD_CATEGORY_VALUE_ANONYMOUS = 'anonymous'

export type BoardCategoryValue =
  | typeof BOARD_CATEGORY_VALUE_GENERAL
  | typeof BOARD_CATEGORY_VALUE_FREE
  | typeof BOARD_CATEGORY_VALUE_INFO
  | typeof BOARD_CATEGORY_VALUE_QNA
  | typeof BOARD_CATEGORY_VALUE_ANONYMOUS

/** 글쓰기·수정 분류 순서: 일반 → 자유 → 사내소식 → Q&A → 익명 */
export const BOARD_CATEGORY_OPTIONS: { value: BoardCategoryValue; label: string }[] = [
  { value: BOARD_CATEGORY_VALUE_GENERAL, label: '일반' },
  { value: BOARD_CATEGORY_VALUE_FREE, label: '자유' },
  { value: BOARD_CATEGORY_VALUE_INFO, label: '사내소식' },
  { value: BOARD_CATEGORY_VALUE_QNA, label: 'Q&A' },
  { value: BOARD_CATEGORY_VALUE_ANONYMOUS, label: '익명' },
]

/** 목록 탭: 전체 + 위와 동일 순서 */
export const BOARD_LIST_TABS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  ...BOARD_CATEGORY_OPTIONS,
]

const LABEL_BY_VALUE = new Map(BOARD_CATEGORY_OPTIONS.map((o) => [o.value, o.label]))

export function getBoardCategoryLabel(category: string | null | undefined): string {
  if (category == null || category === '') return '—'
  return LABEL_BY_VALUE.get(category as BoardCategoryValue) ?? category
}

export function boardBodyHasImages(html: string): boolean {
  return /<img\s/i.test(html)
}

/** 익명 게시판: 글·댓글 작성자 표시 (같은 글·같은 계정이면 항상 동일한 난수) */
export function boardAnonymousDisplayName(authorId: string, postId: string): string {
  const salt = `${authorId}:${postId}`
  let h = 0
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(31, h) + salt.charCodeAt(i) | 0
  }
  const hex = Math.abs(h).toString(16).padStart(7, '0').slice(0, 7)
  return `익명_${hex}`
}

export function isAnonymousBoardCategory(category: string | null | undefined): boolean {
  return category === BOARD_CATEGORY_VALUE_ANONYMOUS
}

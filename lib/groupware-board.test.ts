import { describe, expect, it } from 'vitest'
import {
  BOARD_CATEGORY_VALUE_ANONYMOUS,
  boardAnonymousDisplayName,
  getBoardCategoryLabel,
  isAnonymousBoardCategory,
} from '@/lib/groupware-board'

describe('boardAnonymousDisplayName', () => {
  it('is stable for same author and post', () => {
    const a = boardAnonymousDisplayName('user-uuid', 'post-1')
    const b = boardAnonymousDisplayName('user-uuid', 'post-1')
    expect(a).toBe(b)
    expect(a).toMatch(/^익명_[0-9a-f]{7}$/)
  })

  it('differs when author id differs (same post)', () => {
    const a = boardAnonymousDisplayName('author-a-uuid', 'shared-post')
    const b = boardAnonymousDisplayName('author-b-uuid', 'shared-post')
    expect(a).not.toBe(b)
  })
})

describe('board category helpers', () => {
  it('detects anonymous category', () => {
    expect(isAnonymousBoardCategory(BOARD_CATEGORY_VALUE_ANONYMOUS)).toBe(true)
    expect(isAnonymousBoardCategory('general')).toBe(false)
  })

  it('getBoardCategoryLabel falls back to raw value', () => {
    expect(getBoardCategoryLabel('unknown_cat')).toBe('unknown_cat')
    expect(getBoardCategoryLabel(BOARD_CATEGORY_VALUE_ANONYMOUS)).toBe('익명')
  })
})

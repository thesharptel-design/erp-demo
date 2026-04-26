import { describe, expect, it } from 'vitest'
import { normalizeEmptyParagraphsInRichHtml } from '@/lib/html-content'

describe('normalizeEmptyParagraphsInRichHtml', () => {
  it('turns empty paragraphs into br paragraphs', () => {
    expect(normalizeEmptyParagraphsInRichHtml('<p></p><p>Hi</p>')).toBe('<p><br></p><p>Hi</p>')
  })

  it('handles whitespace-only paragraphs', () => {
    expect(normalizeEmptyParagraphsInRichHtml('<p>  \t</p><p>Next</p>')).toBe('<p><br></p><p>Next</p>')
  })

  it('leaves paragraphs with content unchanged', () => {
    const s = '<p>Line1</p><p>Line2</p>'
    expect(normalizeEmptyParagraphsInRichHtml(s)).toBe(s)
  })
})

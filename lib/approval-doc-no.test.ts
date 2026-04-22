import { describe, expect, it, vi } from 'vitest'
import { generateNextAppDocNo, generateNextDroDocNo } from '@/lib/approval-doc-no'

describe('generateNextAppDocNo', () => {
  it('returns APP-YYMMDD-HHMM when free', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn((_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (!opts?.head) return {}
          return {
            eq: vi.fn(() => ({
              neq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
            })),
          }
        }),
      })),
    }
    const docNo = await generateNextAppDocNo(client as never)
    expect(docNo).toMatch(/^APP-\d{6}-\d{4}$/)
  })

  it('appends -2 when base doc_no already exists', async () => {
    let checks = 0
    const client = {
      from: vi.fn(() => ({
        select: vi.fn((_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (!opts?.head) return {}
          return {
            eq: vi.fn(() => ({
              neq: vi.fn(() => {
                checks++
                return Promise.resolve({ count: checks === 1 ? 1 : 0, error: null })
              }),
            })),
          }
        }),
      })),
    }
    const docNo = await generateNextAppDocNo(client as never)
    expect(docNo).toMatch(/^APP-\d{6}-\d{4}-2$/)
  })
})

describe('generateNextDroDocNo', () => {
  it('returns DRO-YYMMDD-HHMM when free', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn((_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (!opts?.head) return {}
          return {
            eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          }
        }),
      })),
    }
    const docNo = await generateNextDroDocNo(client as never)
    expect(docNo).toMatch(/^DRO-\d{6}-\d{4}$/)
  })

  it('appends -2 when base doc_no already exists', async () => {
    let checks = 0
    const client = {
      from: vi.fn(() => ({
        select: vi.fn((_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (!opts?.head) return {}
          return {
            eq: vi.fn(() => {
              checks++
              return Promise.resolve({ count: checks === 1 ? 1 : 0, error: null })
            }),
          }
        }),
      })),
    }
    const docNo = await generateNextDroDocNo(client as never)
    expect(docNo).toMatch(/^DRO-\d{6}-\d{4}-2$/)
  })
})

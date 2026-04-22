import { describe, expect, it, vi } from 'vitest'
import { generateNextSerialDocNo, hhmm, yyMMDD } from '@/lib/serial-doc-no'

describe('hhmm / yyMMDD', () => {
  it('formats time as HHMM', () => {
    expect(hhmm(new Date(2026, 3, 22, 14, 30))).toBe('1430')
  })
  it('formats date as YYMMDD', () => {
    expect(yyMMDD(new Date(2026, 3, 22))).toBe('260422')
  })
})

describe('generateNextSerialDocNo', () => {
  it('increments tail from latest row', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn((cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head && opts?.count === 'exact') {
            return {
              eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
            }
          }
          return {
            like: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() =>
                  Promise.resolve({
                    data: [{ po_no: 'PO-000101-0005' }],
                    error: null,
                  })
                ),
              })),
            })),
          }
        }),
      })),
    }
    const next = await generateNextSerialDocNo(client as never, {
      table: 'purchase_orders',
      column: 'po_no',
      code: 'PO',
      date: new Date(Date.UTC(2000, 0, 1)),
    })
    expect(next.endsWith('0006')).toBe(true)
  })

  it('re-queries max after a duplicate candidate is detected', async () => {
    let maxCalls = 0
    const client = {
      from: vi.fn(() => ({
        select: vi.fn((cols?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head && opts?.count === 'exact') {
            return {
              eq: vi.fn(() => {
                maxCalls++
                return Promise.resolve({ count: maxCalls === 1 ? 1 : 0, error: null })
              }),
            }
          }
          return {
            like: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => {
                  const n = maxCalls >= 1 ? 2 : 1
                  return Promise.resolve({
                    data: [{ po_no: `PO-000101-000${n}` }],
                    error: null,
                  })
                }),
              })),
            })),
          }
        }),
      })),
    }
    const next = await generateNextSerialDocNo(client as never, {
      table: 'purchase_orders',
      column: 'po_no',
      code: 'PO',
      date: new Date(Date.UTC(2000, 0, 1)),
      maxAttempts: 6,
    })
    expect(next.endsWith('0003')).toBe(true)
  })
})

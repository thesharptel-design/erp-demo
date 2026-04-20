import { describe, expect, it, vi } from 'vitest'
import { generateEmployeeNoWithRetry } from '@/lib/employee-no'

describe('generateEmployeeNoWithRetry', () => {
  it('returns first available candidate', async () => {
    const client = {
      rpc: vi.fn(() => Promise.resolve({ data: '26-0001', error: null })),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
        })),
      })),
    }

    const employeeNo = await generateEmployeeNoWithRetry(client as never)
    expect(employeeNo).toBe('26-0001')
  })

  it('retries when candidate already exists', async () => {
    let call = 0
    const client = {
      rpc: vi.fn(() => {
        call += 1
        return Promise.resolve({ data: call === 1 ? '26-0001' : '26-0002', error: null })
      }),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn((_: string, value: string) =>
            Promise.resolve({ count: value === '26-0001' ? 1 : 0, error: null })
          ),
        })),
      })),
    }

    const employeeNo = await generateEmployeeNoWithRetry(client as never, 3)
    expect(employeeNo).toBe('26-0002')
  })
})

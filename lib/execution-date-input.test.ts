import { describe, expect, it } from 'vitest'
import {
  compactEightDigitsToIso,
  executionDateForDb,
  executionDateInputDisplay,
  filterExecutionDateDigits,
  normalizeExecutionDateOnBlur,
} from '@/lib/execution-date-input'

describe('filterExecutionDateDigits', () => {
  it('keeps digits only up to 8', () => {
    expect(filterExecutionDateDigits('2026-04-28')).toBe('20260428')
    expect(filterExecutionDateDigits('2026048')).toBe('2026048')
  })
})

describe('compactEightDigitsToIso', () => {
  it('accepts valid calendar day', () => {
    expect(compactEightDigitsToIso('20260428')).toBe('2026-04-28')
  })
  it('rejects invalid calendar', () => {
    expect(compactEightDigitsToIso('20260231')).toBeNull()
  })
})

describe('normalizeExecutionDateOnBlur', () => {
  it('converts 8 valid digits to ISO', () => {
    expect(normalizeExecutionDateOnBlur('20260428')).toBe('2026-04-28')
  })
})

describe('executionDateInputDisplay', () => {
  it('strips hyphens from ISO', () => {
    expect(executionDateInputDisplay('2026-04-28')).toBe('20260428')
  })
})

describe('executionDateForDb', () => {
  it('returns ISO for valid stored forms', () => {
    expect(executionDateForDb('20260428')).toBe('2026-04-28')
    expect(executionDateForDb('2026-04-28')).toBe('2026-04-28')
  })
  it('returns null for partial', () => {
    expect(executionDateForDb('2026048')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { POST } from '@/app/outbound-requests/submit/route'

describe('legacy outbound submit route', () => {
  it('returns 410 so legacy calls cannot create approval docs without v2 lines', async () => {
    const response = await POST()
    const payload = (await response.json()) as { error?: string }

    expect(response.status).toBe(410)
    expect(payload.error).toContain('결재라인 v2')
  })
})

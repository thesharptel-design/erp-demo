import { describe, expect, it, vi } from 'vitest'
import { sanitizeMessageRecipientSearchQuery, sendDirectPrivateMessage } from '@/lib/private-messages-direct'

describe('sanitizeMessageRecipientSearchQuery', () => {
  it('strips ilike metacharacters and caps length', () => {
    expect(sanitizeMessageRecipientSearchQuery('  a%b_c\\d  ')).toBe('abcd')
    expect(sanitizeMessageRecipientSearchQuery('x'.repeat(60)).length).toBe(48)
  })

  it('returns empty for whitespace only', () => {
    expect(sanitizeMessageRecipientSearchQuery('   ')).toBe('')
  })
})

describe('sendDirectPrivateMessage', () => {
  it('rejects self-recipient', async () => {
    const from = vi.fn()
    const r = await sendDirectPrivateMessage({ from } as never, {
      senderId: 'u1',
      recipientUserId: 'u1',
      subject: 'a',
      body: 'b',
    })
    expect(r).toEqual({ ok: false, message: '본인에게는 쪽지를 보낼 수 없습니다.' })
    expect(from).not.toHaveBeenCalled()
  })

  it('inserts message then recipient', async () => {
    const insertRec = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === 'private_messages') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'm1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'private_message_recipients') {
        return { insert: insertRec }
      }
      return { insert: vi.fn() }
    })
    const r = await sendDirectPrivateMessage({ from } as never, {
      senderId: 'a',
      recipientUserId: 'b',
      subject: '제목',
      body: '본문',
      startNewThread: true,
    })
    expect(r).toEqual({ ok: true })
    expect(insertRec).toHaveBeenCalled()
  })
})

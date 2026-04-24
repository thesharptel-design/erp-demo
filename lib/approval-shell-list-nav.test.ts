import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { runApprovalShellListReturnToList } from '@/lib/approval-shell-list-nav'

describe('runApprovalShellListReturnToList', () => {
  const pendingTimeouts: (() => void)[] = []

  beforeEach(() => {
    pendingTimeouts.length = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function installWindow(opts: {
    openerReload?: () => void
    openerReloadThrows?: boolean
    hasOpener?: boolean
  }) {
    const reload = vi.fn(() => {
      if (opts.openerReloadThrows) throw new Error('blocked')
    })
    const close = vi.fn()
    const location = { href: '/view/start' }
    const win = {
      opener: opts.hasOpener === false ? undefined : { location: { reload } },
      close,
      location,
      setTimeout: (fn: () => void, _ms: number) => {
        pendingTimeouts.push(fn)
        return pendingTimeouts.length
      },
    }
    vi.stubGlobal('window', win as unknown as Window & typeof globalThis)
    return { reload, close, location }
  }

  it('opener.reload → close → 150ms 후 location.href 로 이동', () => {
    const { reload, close, location } = installWindow({})
    runApprovalShellListReturnToList('/approvals')
    expect(reload).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(pendingTimeouts).toHaveLength(1)
    pendingTimeouts[0]()
    expect(location.href).toBe('/approvals')
  })

  it('opener 없어도 close·폴백 이동은 수행', () => {
    const { reload, close, location } = installWindow({ hasOpener: false })
    runApprovalShellListReturnToList('/outbound-requests')
    expect(reload).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    pendingTimeouts[0]()
    expect(location.href).toBe('/outbound-requests')
  })

  it('reload 예외가 나도 close·폴백 이동은 수행', () => {
    const { reload, close, location } = installWindow({ openerReloadThrows: true })
    runApprovalShellListReturnToList('/approvals')
    expect(reload).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    pendingTimeouts[0]()
    expect(location.href).toBe('/approvals')
  })
})

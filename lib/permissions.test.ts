import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}))
import { hasOutboundPermission, isSystemAdminUser } from '@/lib/permissions'

describe('isSystemAdminUser', () => {
  it('returns true for admin role', () => {
    expect(
      isSystemAdminUser({
        role_name: 'admin',
        can_manage_permissions: false,
        can_admin_manage: false,
      } as const)
    ).toBe(true)
  })

  it('returns true for permission manager even without admin role', () => {
    expect(
      isSystemAdminUser({
        role_name: 'staff',
        can_manage_permissions: true,
        can_admin_manage: false,
      } as const)
    ).toBe(true)
  })
})

describe('hasOutboundPermission', () => {
  it('denies all when user is null', () => {
    expect(hasOutboundPermission(null, 'can_outbound_view')).toBe(false)
    expect(hasOutboundPermission(null, 'can_outbound_execute_self')).toBe(false)
  })

  it('can_outbound_view is implied by any outbound action permission', () => {
    expect(
      hasOutboundPermission(
        {
          role_name: 'staff',
          can_manage_permissions: false,
          can_admin_manage: false,
          can_outbound_assign_handler: true,
        },
        'can_outbound_view'
      )
    ).toBe(true)
    expect(
      hasOutboundPermission(
        {
          role_name: 'staff',
          can_manage_permissions: false,
          can_admin_manage: false,
          can_outbound_reassign_recall: true,
        },
        'can_outbound_view'
      )
    ).toBe(true)
  })

  it('can_outbound_execute_any implies can_outbound_execute_self', () => {
    expect(
      hasOutboundPermission(
        {
          role_name: 'staff',
          can_manage_permissions: false,
          can_admin_manage: false,
          can_outbound_execute_any: true,
        },
        'can_outbound_execute_self'
      )
    ).toBe(true)
  })

  it('does not imply assign/reassign from execute_self only', () => {
    const user = {
      role_name: 'staff',
      can_manage_permissions: false,
      can_admin_manage: false,
      can_outbound_execute_self: true,
      can_outbound_assign_handler: false,
      can_outbound_reassign_recall: false,
      can_outbound_execute_any: false,
    }
    expect(hasOutboundPermission(user, 'can_outbound_assign_handler')).toBe(false)
    expect(hasOutboundPermission(user, 'can_outbound_reassign_recall')).toBe(false)
  })

  it('allows all outbound permissions for permission manager', () => {
    const systemAdminLike = {
      role_name: 'staff',
      can_manage_permissions: true,
      can_admin_manage: false,
    }
    expect(hasOutboundPermission(systemAdminLike, 'can_outbound_view')).toBe(true)
    expect(hasOutboundPermission(systemAdminLike, 'can_outbound_assign_handler')).toBe(true)
    expect(hasOutboundPermission(systemAdminLike, 'can_outbound_reassign_recall')).toBe(true)
    expect(hasOutboundPermission(systemAdminLike, 'can_outbound_execute_any')).toBe(true)
  })
})

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import UserAccessControlClient from './user-access-control-client'

function canAccessUserAccessControl(user: { role_name: string | null; can_manage_permissions: boolean | null } | null) {
  if (!user) return false
  const roleName = String(user.role_name ?? '').toLowerCase()
  return roleName === 'admin' || user.can_manage_permissions === true
}

export default async function UserAccessControlPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('role_name, can_manage_permissions')
    .eq('id', authUser.id)
    .maybeSingle()

  if (!canAccessUserAccessControl(appUser ?? null)) {
    redirect('/dashboard')
  }

  return <UserAccessControlClient />
}


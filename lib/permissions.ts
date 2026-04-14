import { supabase } from '@/lib/supabase'

export type CurrentUserPermissions = {
  id: string
  login_id: string
  email: string | null
  user_name: string
  role_name: string
  can_quote_create: boolean
  can_po_create: boolean
  can_receive_stock: boolean
  can_prod_complete: boolean
  can_approve: boolean
  can_manage_permissions: boolean
  can_qc_manage: boolean
}

export async function getCurrentUserPermissions() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    return null
  }

  const { data, error } = await supabase
    .from('app_users')
    .select(`
      id,
      login_id,
      email,
      user_name,
      role_name,
      can_quote_create,
      can_po_create,
      can_receive_stock,
      can_prod_complete,
      can_approve,
      can_manage_permissions,
      can_qc_manage
    `)
    .eq('email', user.email)
    .single()

  if (error || !data) {
    return null
  }

  return data as CurrentUserPermissions
}
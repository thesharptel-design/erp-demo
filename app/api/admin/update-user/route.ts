import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { hasManagePermission } from '@/lib/permissions';

const ALLOWED_USER_KINDS = ['student', 'teacher', 'staff'] as const;
type UserKind = (typeof ALLOWED_USER_KINDS)[number];
const PERMISSION_KEYS = [
  'can_manage_master',
  'can_sales_manage',
  'can_material_manage',
  'can_production_manage',
  'can_qc_manage',
  'can_admin_manage',
  'can_manage_permissions',
  'can_quote_create',
  'can_po_create',
  'can_receive_stock',
  'can_prod_complete',
  'can_approve',
] as const;

function normalizePermissionPayload(raw: Record<string, unknown>) {
  const asBool = (value: unknown) => value === true;

  const canSalesManage = asBool(raw.can_sales_manage) || asBool(raw.can_po_create) || asBool(raw.can_quote_create);
  const canMaterialManage = asBool(raw.can_material_manage) || asBool(raw.can_receive_stock);
  const canProductionManage = asBool(raw.can_production_manage) || asBool(raw.can_prod_complete);
  const canQcManage = asBool(raw.can_qc_manage) || asBool(raw.can_approve);
  const canAdminManage = asBool(raw.can_admin_manage) || asBool(raw.can_manage_permissions);
  const canManageMaster = asBool(raw.can_manage_master);
  const canManagePermissions = asBool(raw.can_manage_permissions);

  return {
    can_manage_master: canManageMaster,
    can_sales_manage: canSalesManage,
    can_material_manage: canMaterialManage,
    can_production_manage: canProductionManage,
    can_qc_manage: canQcManage,
    can_admin_manage: canAdminManage,
    can_manage_permissions: canManagePermissions,
    can_quote_create: canSalesManage,
    can_po_create: canSalesManage,
    can_receive_stock: canMaterialManage,
    can_prod_complete: canProductionManage,
    can_approve: canQcManage,
  };
}

function parseWarehouseIds(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    const parsed = raw
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    return Array.from(new Set(parsed));
  }
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const parsed = text
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  return Array.from(new Set(parsed));
}

function hasOwnKey(payload: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function normalizeNullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const {
      id,
      email,
      user_name,
      phone,
      department,
      job_rank,
      role_name,
      new_password,
      user_kind,
      training_program,
      school_name,
      seal_image_path,
      grade_level,
      major,
      teacher_subject,
      can_approval_participate,
      warehouse_ids,
      ...permissionPayload
    } = payload;

    const targetUserId = String(id ?? '').trim();
    if (!targetUserId) {
      return NextResponse.json({ success: false, error: '수정 대상 사용자 ID가 없습니다.' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 정보가 없습니다.' }, { status: 401 });
    }
    const jwt = authHeader.replace('Bearer ', '');
    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (currentUserError || !currentUser?.email) {
      return NextResponse.json({ success: false, error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 });
    }

    const { data: currentAppUser, error: currentAppUserError } = await supabaseAdmin
      .from('app_users')
      .select('id, role_name, can_manage_permissions, can_admin_manage')
      .eq('email', currentUser.email)
      .single();

    if (currentAppUserError || !hasManagePermission(currentAppUser, 'can_manage_permissions')) {
      return NextResponse.json({ success: false, error: '사용자 수정 권한이 없습니다.' }, { status: 403 });
    }

    // 1. Auth(인증) 정보 업데이트 (이메일이나 비밀번호가 변경되었을 때만 작동)
    const authUpdates: Record<string, unknown> = {};
    if (email) authUpdates.email = email;
    if (new_password) authUpdates.password = new_password; // 🌟 새로운 비밀번호 덮어쓰기
    if (user_name) authUpdates.user_metadata = { user_name };

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, authUpdates);
      if (authError) throw authError;
    }

    // 2. app_users 테이블(ERP 정보) 업데이트
    const appUserUpdates: Record<string, unknown> = {};
    const hasPermissionUpdate = PERMISSION_KEYS.some((key) => hasOwnKey(payload, key));
    if (hasPermissionUpdate) {
      const permissionOnlyPayload = Object.fromEntries(
        PERMISSION_KEYS.filter((key) => hasOwnKey(payload, key)).map((key) => [key, payload[key]])
      );
      Object.assign(appUserUpdates, normalizePermissionPayload(permissionOnlyPayload));
    }
    if (hasOwnKey(payload, 'email')) appUserUpdates.email = email;
    if (hasOwnKey(payload, 'user_name')) appUserUpdates.user_name = user_name;
    if (hasOwnKey(payload, 'phone')) appUserUpdates.phone = phone;
    if (hasOwnKey(payload, 'department')) appUserUpdates.department = department;
    if (hasOwnKey(payload, 'job_rank')) appUserUpdates.job_rank = job_rank;
    if (hasOwnKey(payload, 'role_name')) appUserUpdates.role_name = role_name;
    if (hasOwnKey(payload, 'training_program')) appUserUpdates.training_program = normalizeNullableText(training_program);
    if (hasOwnKey(payload, 'school_name')) appUserUpdates.school_name = normalizeNullableText(school_name);
    if (hasOwnKey(payload, 'seal_image_path')) appUserUpdates.seal_image_path = normalizeNullableText(seal_image_path);
    if (hasOwnKey(payload, 'grade_level')) appUserUpdates.grade_level = normalizeNullableText(grade_level);
    if (hasOwnKey(payload, 'major')) appUserUpdates.major = normalizeNullableText(major);
    if (hasOwnKey(payload, 'teacher_subject')) appUserUpdates.teacher_subject = normalizeNullableText(teacher_subject);
    if (hasOwnKey(payload, 'can_approval_participate')) {
      appUserUpdates.can_approval_participate = can_approval_participate === true;
    }
    if (hasOwnKey(payload, 'user_kind')) {
      const normalizedUserKind = String(user_kind ?? '').trim().toLowerCase();
      if (!ALLOWED_USER_KINDS.includes(normalizedUserKind as UserKind)) {
        return NextResponse.json({ success: false, error: 'user_kind 값이 올바르지 않습니다.' }, { status: 400 });
      }
      appUserUpdates.user_kind = normalizedUserKind;
    }

    const { error: dbError } = await supabaseAdmin
      .from('app_users')
      .update(appUserUpdates)
      .eq('id', targetUserId);

    if (dbError) throw dbError;

    if (hasOwnKey(payload, 'warehouse_ids')) {
      const warehouseIds = parseWarehouseIds(warehouse_ids);
      const { error: clearWarehouseError } = await supabaseAdmin
        .from('app_user_warehouses')
        .delete()
        .eq('user_id', targetUserId);
      if (clearWarehouseError) throw clearWarehouseError;

      if (warehouseIds.length > 0) {
        const warehouseRows = warehouseIds.map((warehouseId) => ({
          user_id: targetUserId,
          warehouse_id: warehouseId,
        }));
        const { error: insertWarehouseError } = await supabaseAdmin
          .from('app_user_warehouses')
          .upsert(warehouseRows, { onConflict: 'user_id,warehouse_id' });
        if (insertWarehouseError) throw insertWarehouseError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
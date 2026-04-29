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
  'can_outbound_view',
  'can_outbound_execute_self',
  'can_outbound_assign_handler',
  'can_outbound_reassign_recall',
  'can_outbound_execute_any',
  'can_quote_create',
  'can_po_create',
  'can_receive_stock',
  'can_prod_complete',
  'can_approve',
] as const;
const OUTBOUND_ROLE_KEY = 'outbound_role' as const;

function normalizeOutboundRole(raw: unknown): 'none' | 'viewer' | 'worker' | 'master' | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'none' || value === 'viewer' || value === 'worker' || value === 'master') return value;
  return null;
}

function normalizePermissionPayload(raw: Record<string, unknown>) {
  const asBool = (value: unknown) => value === true;

  const canSalesManage = asBool(raw.can_sales_manage) || asBool(raw.can_po_create) || asBool(raw.can_quote_create);
  const canMaterialManage = asBool(raw.can_material_manage) || asBool(raw.can_receive_stock);
  const canProductionManage = asBool(raw.can_production_manage) || asBool(raw.can_prod_complete);
  const canQcManage = asBool(raw.can_qc_manage) || asBool(raw.can_approve);
  const canAdminManage = false;
  const canManageMaster = asBool(raw.can_manage_master);
  const canManagePermissions = asBool(raw.can_manage_permissions);
  const explicitOutboundRole = normalizeOutboundRole(raw[OUTBOUND_ROLE_KEY]);
  const inferredOutboundRole: 'none' | 'viewer' | 'worker' | 'master' =
    explicitOutboundRole ??
    (asBool(raw.can_outbound_execute_any) ||
    asBool(raw.can_outbound_assign_handler) ||
    asBool(raw.can_outbound_reassign_recall)
      ? 'master'
      : asBool(raw.can_outbound_execute_self)
        ? 'worker'
        : asBool(raw.can_outbound_view)
          ? 'viewer'
          : 'none');
  const canOutboundView = inferredOutboundRole !== 'none';
  const canOutboundExecuteSelf = inferredOutboundRole === 'worker' || inferredOutboundRole === 'master';
  const canOutboundAssignHandler = inferredOutboundRole === 'master';
  const canOutboundReassignRecall = inferredOutboundRole === 'master';
  const canOutboundExecuteAny = inferredOutboundRole === 'master';

  return {
    can_manage_master: canManageMaster,
    can_sales_manage: canSalesManage,
    can_material_manage: canMaterialManage,
    can_production_manage: canProductionManage,
    can_qc_manage: canQcManage,
    can_admin_manage: canAdminManage,
    can_manage_permissions: canManagePermissions,
    outbound_role: inferredOutboundRole,
    can_outbound_view: canOutboundView,
    can_outbound_execute_self: canOutboundExecuteSelf,
    can_outbound_assign_handler: canOutboundAssignHandler,
    can_outbound_reassign_recall: canOutboundReassignRecall,
    can_outbound_execute_any: canOutboundExecuteAny,
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

const OUTBOUND_PERMISSION_DB_KEYS = [
  'outbound_role',
  'can_outbound_view',
  'can_outbound_execute_self',
  'can_outbound_assign_handler',
  'can_outbound_reassign_recall',
  'can_outbound_execute_any',
] as const

const OUTBOUND_PERMISSION_KEY_SET = new Set<string>(OUTBOUND_PERMISSION_DB_KEYS)

/** DB 마이그레이션 전·스키마 차이로 `can_outbound_*` 컬럼이 없을 때 대비 */
async function fetchAppUserPermissionRowForMerge(
  supabaseAdmin: any,
  targetUserId: string
): Promise<Record<string, unknown> | null> {
  const fullSelect = PERMISSION_KEYS.join(', ')
  const r1 = await supabaseAdmin.from('app_users').select(fullSelect).eq('id', targetUserId).maybeSingle()

  if (!r1.error && r1.data) {
    return r1.data as Record<string, unknown>
  }

  if (!r1.error && !r1.data) {
    return null
  }

  const msg = String(r1.error?.message ?? '')
  const outboundColumnMissing = /outbound_role|can_outbound_(view|execute_self|assign_handler|reassign_recall|execute_any)/i.test(msg)

  if (outboundColumnMissing) {
    const withoutOutbound = PERMISSION_KEYS.filter((k) => !OUTBOUND_PERMISSION_KEY_SET.has(k)).join(', ')
    const r2 = await supabaseAdmin.from('app_users').select(withoutOutbound).eq('id', targetUserId).maybeSingle()
    if (r2.error || !r2.data) {
      return null
    }
    const row = { ...(r2.data as Record<string, unknown>) }
    for (const k of OUTBOUND_PERMISSION_DB_KEYS) {
      if (!(k in row)) row[k] = false
    }
    return row
  }

  return null
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
    const hasPermissionUpdate = PERMISSION_KEYS.some((key) => hasOwnKey(payload, key)) || hasOwnKey(payload, OUTBOUND_ROLE_KEY);
    if (hasPermissionUpdate) {
      const permissionOnlyPayload = Object.fromEntries(
        [...PERMISSION_KEYS, OUTBOUND_ROLE_KEY].filter((key) => hasOwnKey(payload, key)).map((key) => [key, payload[key]])
      );
      const hasAllPermissionKeys = PERMISSION_KEYS.every((key) => hasOwnKey(permissionOnlyPayload, key));

      let mergedPermissionPayload = permissionOnlyPayload;
      if (!hasAllPermissionKeys) {
        const currentPermissionRow = await fetchAppUserPermissionRowForMerge(supabaseAdmin, targetUserId);

        if (!currentPermissionRow) {
          return NextResponse.json({ success: false, error: '기존 권한 정보를 불러오지 못했습니다.' }, { status: 400 });
        }

        mergedPermissionPayload = {
          ...currentPermissionRow,
          ...permissionOnlyPayload,
        };
      }

      Object.assign(appUserUpdates, normalizePermissionPayload(mergedPermissionPayload));
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
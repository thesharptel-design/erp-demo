import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { generateEmployeeNoWithRetry } from '@/lib/employee-no';
import { hasManagePermission } from '@/lib/permissions';

const ALLOWED_USER_KINDS = ['student', 'teacher', 'staff'] as const;
type UserKind = (typeof ALLOWED_USER_KINDS)[number];

function normalizePermissionPayload(raw: Record<string, unknown>) {
  const asBool = (value: unknown) => value === true;

  const canSalesManage = asBool(raw.can_sales_manage) || asBool(raw.can_po_create) || asBool(raw.can_quote_create);
  const canMaterialManage = asBool(raw.can_material_manage) || asBool(raw.can_receive_stock);
  const canProductionManage = asBool(raw.can_production_manage) || asBool(raw.can_prod_complete);
  const canQcManage = asBool(raw.can_qc_manage) || asBool(raw.can_approve);
  const canAdminManage = false;
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
    // legacy fallback columns
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

function normalizeNullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    email,
    password,
    user_name,
    phone,
    department,
    job_rank,
    role_name,
    user_kind,
    training_program,
    school_name,
    seal_image_path,
    grade_level,
    major,
    teacher_subject,
    can_approval_participate,
    warehouse_ids,
    ...permissions
  } = body;
  
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 });
  }
  const jwt = authHeader.replace('Bearer ', '');
  const {
    data: { user: currentUser },
    error: currentUserError,
  } = await supabaseAdmin.auth.getUser(jwt);
  if (currentUserError || !currentUser?.email) {
    return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 });
  }

  const { data: currentAppUser, error: currentAppUserError } = await supabaseAdmin
    .from('app_users')
    .select('id, role_name, can_manage_permissions, can_admin_manage')
    .eq('email', currentUser.email)
    .single();

  if (currentAppUserError || !hasManagePermission(currentAppUser, 'can_manage_permissions')) {
    return NextResponse.json({ error: '사용자 생성 권한이 없습니다.' }, { status: 403 });
  }

  const normalizedUserKind = String(user_kind ?? 'staff').trim().toLowerCase();
  if (!ALLOWED_USER_KINDS.includes(normalizedUserKind as UserKind)) {
    return NextResponse.json({ error: 'user_kind 값이 올바르지 않습니다.' }, { status: 400 });
  }

  const normalizedWarehouseIds = parseWarehouseIds(warehouse_ids);
  const normalizedPermissions = normalizePermissionPayload(permissions);

  // 1. Auth 계정 생성
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { user_name }
  });

  // 이미 있다면 에러를 뱉지 않고 기존 ID를 가져오도록 처리 (혹시 모를 상황 대비)
  if (authError) {
     return NextResponse.json({ error: "이미 등록된 이메일입니다. Auth에서 삭제 후 다시 시도하세요." }, { status: 400 });
  }

  let upsertError: { message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const employeeNo = await generateEmployeeNoWithRetry(supabaseAdmin);
    const { error } = await supabaseAdmin
      .from('app_users')
      .upsert(
        [
          {
            id: authUser.user.id,
            email,
            user_name,
            phone,
            department,
            job_rank,
            user_kind: normalizedUserKind,
            training_program: normalizeNullableText(training_program),
            school_name: normalizeNullableText(school_name),
            seal_image_path: normalizeNullableText(seal_image_path),
            grade_level: normalizeNullableText(grade_level),
            major: normalizeNullableText(major),
            teacher_subject: normalizeNullableText(teacher_subject),
            can_approval_participate: can_approval_participate === undefined ? true : can_approval_participate === true,
            employee_no: employeeNo,
            role_name: role_name || 'staff',
            is_active: true,
            ...normalizedPermissions,
          },
        ],
        { onConflict: 'email' }
      );

    if (!error) {
      upsertError = null;
      break;
    }

    upsertError = error;
    if (error.message.toLowerCase().includes('employee_no')) {
      continue;
    }
    break;
  }

  if (upsertError) return NextResponse.json({ error: "DB 저장 실패: " + upsertError.message }, { status: 400 });

  if (normalizedWarehouseIds.length > 0) {
    const warehouseRows = normalizedWarehouseIds.map((warehouseId) => ({
      user_id: authUser.user.id,
      warehouse_id: warehouseId,
    }));
    const { error: warehouseError } = await supabaseAdmin
      .from('app_user_warehouses')
      .upsert(warehouseRows, { onConflict: 'user_id,warehouse_id' });

    if (warehouseError) {
      return NextResponse.json({ error: '창고 권한 저장 실패: ' + warehouseError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
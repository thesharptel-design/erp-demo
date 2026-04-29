-- 출고 통제 UI/API에서 사용하는 app_users 권한 플래그
-- (컬럼이 없으면 /api/admin/update-user 가 기존 권한 SELECT 단계에서 실패할 수 있음)

BEGIN;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS can_outbound_view boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_outbound_execute_self boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_outbound_assign_handler boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_outbound_reassign_recall boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_outbound_execute_any boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_users.can_outbound_view IS '출고 요청·현황 조회';
COMMENT ON COLUMN public.app_users.can_outbound_execute_self IS '출고 본인(담당) 직접 처리';
COMMENT ON COLUMN public.app_users.can_outbound_assign_handler IS '출고 담당자 지정';
COMMENT ON COLUMN public.app_users.can_outbound_reassign_recall IS '출고 담당자 변경·회수';
COMMENT ON COLUMN public.app_users.can_outbound_execute_any IS '출고 임의 직접 처리';

COMMIT;

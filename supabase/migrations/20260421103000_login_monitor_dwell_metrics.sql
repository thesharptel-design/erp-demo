BEGIN;

-- 누적/일일 체류 시간 (마스터: app_users)
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS total_active_seconds bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_active_seconds bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_stats_date date NULL,
  ADD COLUMN IF NOT EXISTS today_first_login_at timestamptz NULL;

COMMENT ON COLUMN public.app_users.total_active_seconds IS '추적 시작 이후 누적 체류(초)';
COMMENT ON COLUMN public.app_users.today_active_seconds IS 'Asia/Seoul 기준 당일 체류(초)';
COMMENT ON COLUMN public.app_users.today_stats_date IS 'today_active_seconds가 유효한 서울 날짜';
COMMENT ON COLUMN public.app_users.today_first_login_at IS '서울 기준 당일 최초 로그인(또는 첫 활동) 시각';

-- 모니터 조회용 스냅샷 (heartbeat 시 app_users와 동기화)
ALTER TABLE public.active_user_sessions
  ADD COLUMN IF NOT EXISTS total_active_seconds bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_active_seconds bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_first_login_at timestamptz NULL;

COMMENT ON COLUMN public.active_user_sessions.total_active_seconds IS 'app_users.total_active_seconds 스냅샷';
COMMENT ON COLUMN public.active_user_sessions.today_active_seconds IS 'app_users.today_active_seconds 스냅샷';
COMMENT ON COLUMN public.active_user_sessions.today_first_login_at IS 'app_users.today_first_login_at 스냅샷';

ALTER TABLE public.active_user_sessions DROP COLUMN IF EXISTS current_path;

COMMIT;

-- Singleton table: Super Admin (role_name = admin) edits item process categories/checklists in UI.

BEGIN;

CREATE TABLE IF NOT EXISTS public.item_process_config (
  id smallint PRIMARY KEY DEFAULT 1,
  CONSTRAINT item_process_config_singleton CHECK (id = 1),
  categories jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.item_process_config IS
  'Single row id=1. categories JSON: Record<string, string[]> — major category name → checklist labels.';

CREATE OR REPLACE FUNCTION public.touch_item_process_config_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_item_process_config_updated_at ON public.item_process_config;
CREATE TRIGGER trg_touch_item_process_config_updated_at
BEFORE UPDATE ON public.item_process_config
FOR EACH ROW
EXECUTE FUNCTION public.touch_item_process_config_updated_at();

INSERT INTO public.item_process_config (id, categories)
VALUES (
  1,
  $cfg${
    "배양": ["무균 조작 준수", "배양 조건(온도·CO₂ 등) 확인", "배양 기간·상태 기록", "오염·이상 징후 점검"],
    "크로마토": ["장비 시스템 적합성(SST)", "칼럼·모바일 페이즈 조건 확인", "표준품·대조군 대조", "피크 식별·적분 검토"],
    "정제/여과": ["여과 압력·유량 기록", "세척·농축 단계 조성 확인", "중간 시험·농도 확인", "회수율·폐기 기준 준수"],
    "완제/공통": ["최종 라벨·표기 확인", "포장 규격·수량 확인", "출하 전 최종 검사", "보관·취급 주의 표시"],
    "일반": [],
    "장비": [],
    "기타": []
  }$cfg$::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.item_process_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_process_config_select_authenticated ON public.item_process_config;
CREATE POLICY item_process_config_select_authenticated
ON public.item_process_config
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS item_process_config_insert_super_admin ON public.item_process_config;
CREATE POLICY item_process_config_insert_super_admin
ON public.item_process_config
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND lower(COALESCE(u.role_name, '')) = 'admin'
  )
);

DROP POLICY IF EXISTS item_process_config_update_super_admin ON public.item_process_config;
CREATE POLICY item_process_config_update_super_admin
ON public.item_process_config
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND lower(COALESCE(u.role_name, '')) = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND lower(COALESCE(u.role_name, '')) = 'admin'
  )
);

GRANT SELECT, INSERT, UPDATE ON public.item_process_config TO authenticated;

COMMIT;

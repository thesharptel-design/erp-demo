BEGIN;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS user_kind text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS training_program text NULL,
  ADD COLUMN IF NOT EXISTS school_name text NULL,
  ADD COLUMN IF NOT EXISTS seal_image_path text NULL,
  ADD COLUMN IF NOT EXISTS grade_level text NULL,
  ADD COLUMN IF NOT EXISTS major text NULL,
  ADD COLUMN IF NOT EXISTS teacher_subject text NULL,
  ADD COLUMN IF NOT EXISTS can_approval_participate boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_user_kind_check'
      AND conrelid = 'public.app_users'::regclass
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_user_kind_check
      CHECK (user_kind IN ('student', 'teacher', 'staff'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.app_user_warehouses (
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  warehouse_id bigint NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_app_user_warehouses_warehouse_id
  ON public.app_user_warehouses (warehouse_id);

CREATE OR REPLACE FUNCTION public.is_system_admin_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = p_user_id
      AND (
        lower(COALESCE(u.role_name, '')) = 'admin'
        OR COALESCE((to_jsonb(u) ->> 'can_manage_permissions')::boolean, false) = true
        OR COALESCE((to_jsonb(u) ->> 'can_admin_manage')::boolean, false) = true
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_warehouse_access(
  p_user_id uuid,
  p_warehouse_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.is_system_admin_user(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.app_user_warehouses uw
      WHERE uw.user_id = p_user_id
        AND uw.warehouse_id = p_warehouse_id
    );
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_can_approval_participate(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_can_participate boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT u.can_approval_participate
    INTO v_can_participate
    FROM public.app_users u
   WHERE u.id = p_user_id;

  IF v_can_participate IS DISTINCT FROM true THEN
    RAISE EXCEPTION '결재권이 없는 사용자는 기안/결재선에 지정할 수 없습니다. user_id=%', p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_approval_writer_participation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.ensure_user_can_approval_participate(NEW.writer_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_approval_line_participation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.ensure_user_can_approval_participate(NEW.approver_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_approval_participant_participation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.ensure_user_can_approval_participate(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_approval_writer_participation ON public.approval_docs;
CREATE TRIGGER trg_validate_approval_writer_participation
BEFORE INSERT OR UPDATE OF writer_id ON public.approval_docs
FOR EACH ROW
EXECUTE FUNCTION public.validate_approval_writer_participation();

DROP TRIGGER IF EXISTS trg_validate_approval_line_participation ON public.approval_lines;
CREATE TRIGGER trg_validate_approval_line_participation
BEFORE INSERT OR UPDATE OF approver_id ON public.approval_lines
FOR EACH ROW
EXECUTE FUNCTION public.validate_approval_line_participation();

DROP TRIGGER IF EXISTS trg_validate_approval_participant_participation ON public.approval_participants;
CREATE TRIGGER trg_validate_approval_participant_participation
BEFORE INSERT OR UPDATE OF user_id ON public.approval_participants
FOR EACH ROW
EXECUTE FUNCTION public.validate_approval_participant_participation();

INSERT INTO public.app_user_warehouses (user_id, warehouse_id)
SELECT u.id, w.id
FROM public.app_users u
CROSS JOIN public.warehouses w
ON CONFLICT (user_id, warehouse_id) DO NOTHING;

ALTER TABLE public.app_user_warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_user_warehouses_select_policy ON public.app_user_warehouses;
CREATE POLICY app_user_warehouses_select_policy
ON public.app_user_warehouses
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_system_admin_user(auth.uid())
);

DROP POLICY IF EXISTS app_user_warehouses_write_policy ON public.app_user_warehouses;
CREATE POLICY app_user_warehouses_write_policy
ON public.app_user_warehouses
FOR ALL
TO authenticated
USING (public.is_system_admin_user(auth.uid()))
WITH CHECK (public.is_system_admin_user(auth.uid()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('user-seals', 'user-seals', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS user_seals_select_policy ON storage.objects;
CREATE POLICY user_seals_select_policy
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-seals'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
);

DROP POLICY IF EXISTS user_seals_insert_policy ON storage.objects;
CREATE POLICY user_seals_insert_policy
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-seals'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
);

DROP POLICY IF EXISTS user_seals_update_policy ON storage.objects;
CREATE POLICY user_seals_update_policy
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-seals'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'user-seals'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
);

DROP POLICY IF EXISTS user_seals_delete_policy ON storage.objects;
CREATE POLICY user_seals_delete_policy
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-seals'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
);

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'inventory',
    'inventory_transactions',
    'outbound_requests',
    'purchase_orders',
    'production_orders',
    'inbound_requests'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table
        AND c.column_name = 'warehouse_id'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_warehouse_select_policy', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_has_warehouse_access(auth.uid(), warehouse_id))',
      v_table || '_warehouse_select_policy',
      v_table
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_warehouse_insert_policy', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_has_warehouse_access(auth.uid(), warehouse_id))',
      v_table || '_warehouse_insert_policy',
      v_table
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_warehouse_update_policy', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_has_warehouse_access(auth.uid(), warehouse_id)) WITH CHECK (public.user_has_warehouse_access(auth.uid(), warehouse_id))',
      v_table || '_warehouse_update_policy',
      v_table
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS outbound_requests_select_policy ON public.outbound_requests;

COMMIT;

-- 통합 결재문서함: 관련자 접근 보강(결재선), 결재라인 필터에 기안자명, 시스템관리자 판별 정합, approval_lines RLS
BEGIN;

CREATE OR REPLACE FUNCTION public.is_approval_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.app_users u
     WHERE u.id = p_uid
       AND (
         lower(COALESCE(u.role_name, '')) = 'admin'
         OR COALESCE(u.can_manage_permissions, false) = true
         OR COALESCE(u.can_admin_manage, false) = true
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_approval_doc(p_doc_id bigint, p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_approval_admin(p_uid)
    OR public.is_approval_doc_writer(p_doc_id, p_uid)
    OR public.is_approval_doc_participant(p_doc_id, p_uid)
    OR EXISTS (
      SELECT 1
        FROM public.approval_lines l
       WHERE l.approval_doc_id = p_doc_id
         AND l.approver_id = p_uid
    );
$$;

ALTER TABLE public.approval_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_lines_select_policy ON public.approval_lines;
CREATE POLICY approval_lines_select_policy
ON public.approval_lines
FOR SELECT
TO authenticated
USING (public.can_read_approval_doc(approval_doc_id, auth.uid()));

DROP POLICY IF EXISTS approval_lines_insert_policy ON public.approval_lines;
CREATE POLICY approval_lines_insert_policy
ON public.approval_lines
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(approval_doc_id, auth.uid())
);

DROP POLICY IF EXISTS approval_lines_update_policy ON public.approval_lines;
CREATE POLICY approval_lines_update_policy
ON public.approval_lines
FOR UPDATE
TO authenticated
USING (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(approval_doc_id, auth.uid())
  OR approver_id = auth.uid()
)
WITH CHECK (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(approval_doc_id, auth.uid())
  OR approver_id = auth.uid()
);

DROP POLICY IF EXISTS approval_lines_delete_policy ON public.approval_lines;
CREATE POLICY approval_lines_delete_policy
ON public.approval_lines
FOR DELETE
TO authenticated
USING (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(approval_doc_id, auth.uid())
);

CREATE OR REPLACE FUNCTION public.approval_inbox_query(
  p_doc_no text DEFAULT NULL,
  p_doc_type text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_draft_date date DEFAULT NULL,
  p_approver_line text DEFAULT NULL,
  p_progress text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH lim AS (
    SELECT
      greatest(1, least(coalesce(p_limit, 20), 100))::int AS lim_n,
      greatest(0, coalesce(p_offset, 0))::int AS off_n
  ),
  base AS (
    SELECT
      d.id,
      d.doc_no,
      d.title,
      d.status,
      d.remarks,
      d.drafted_at,
      d.completed_at,
      d.doc_type,
      d.writer_id,
      d.dept_id,
      d.current_line_no,
      (
        SELECT string_agg(au.user_name::text, '-' ORDER BY al.line_no)
        FROM public.approval_lines al
        INNER JOIN public.app_users au ON au.id = al.approver_id
        WHERE al.approval_doc_id = d.id
          AND al.approver_role::text = 'approver'
      ) AS cal_approver_line,
      (
        SELECT string_agg(coalesce(au.user_name::text, '') || ':' || al.status::text, ' ' ORDER BY al.line_no)
        FROM public.approval_lines al
        LEFT JOIN public.app_users au ON au.id = al.approver_id
        WHERE al.approval_doc_id = d.id
      ) AS cal_line_trace,
      w.user_name::text AS writer_user_name,
      COALESCE(
        NULLIF(TRIM(dep.dept_name::text), ''),
        NULLIF(
          CASE
            WHEN TRIM(COALESCE(w.department::text, '')) = ''
              OR UPPER(TRIM(COALESCE(w.department::text, ''))) = 'EMPTY' THEN NULL
            ELSE TRIM(w.department::text)
          END,
          ''
        ),
        NULLIF(
          TRIM(
            concat_ws(
              ' · ',
              CASE WHEN w.user_kind::text = 'student' THEN NULLIF(TRIM(w.training_program::text), '') END,
              CASE WHEN w.user_kind::text = 'student' THEN NULLIF(TRIM(w.school_name::text), '') END,
              CASE WHEN w.user_kind::text = 'teacher' THEN NULLIF(TRIM(w.school_name::text), '') END,
              CASE WHEN w.user_kind::text = 'teacher' THEN NULLIF(TRIM(w.teacher_subject::text), '') END
            )
          ),
          ''
        ),
        CASE COALESCE(w.user_kind::text, 'staff')
          WHEN 'student' THEN '학생'
          WHEN 'teacher' THEN '교사'
          ELSE '—'
        END
      )::text AS dept_name,
      (
        SELECT obr.id
        FROM public.outbound_requests obr
        WHERE obr.approval_doc_id = d.id
        ORDER BY obr.id ASC
        LIMIT 1
      ) AS outbound_request_id
    FROM public.approval_docs d
    LEFT JOIN public.app_users w ON w.id = d.writer_id
    LEFT JOIN public.departments dep ON dep.id = d.dept_id
  ),
  filtered AS (
    SELECT *
    FROM base b
    WHERE
      (NULLIF(btrim(p_doc_type), '') IS NULL OR b.doc_type IS NOT DISTINCT FROM NULLIF(btrim(p_doc_type), ''))
      AND (NULLIF(btrim(p_doc_no), '') IS NULL OR strpos(lower(coalesce(b.doc_no, '')), lower(btrim(p_doc_no))) > 0)
      AND (NULLIF(btrim(p_title), '') IS NULL OR strpos(lower(coalesce(b.title, '')), lower(btrim(p_title))) > 0)
      AND (
        p_draft_date IS NULL
        OR (b.drafted_at IS NOT NULL AND (b.drafted_at::date) = p_draft_date)
      )
      AND (
        NULLIF(btrim(p_approver_line), '') IS NULL
        OR strpos(lower(coalesce(b.cal_approver_line, '')), lower(btrim(p_approver_line))) > 0
        OR strpos(lower(coalesce(b.writer_user_name, '')), lower(btrim(p_approver_line))) > 0
        OR strpos(
          lower(
            '[기안자-' || coalesce(nullif(trim(b.writer_user_name::text), ''), '—') || ']-'
            || coalesce(b.cal_approver_line, '')
          ),
          lower(btrim(p_approver_line))
        ) > 0
      )
      AND (
        NULLIF(btrim(p_progress), '') IS NULL
        OR strpos(
          lower(coalesce(b.remarks, '') || ' ' || coalesce(b.cal_line_trace, '')),
          lower(btrim(p_progress))
        ) > 0
      )
      AND (
        NULLIF(btrim(p_status), '') IS NULL
        OR strpos(lower(coalesce(b.remarks, '') || ' ' || b.status::text), lower(btrim(p_status))) > 0
      )
  ),
  tot AS (
    SELECT count(*)::bigint AS c FROM filtered
  ),
  ranked AS (
    SELECT
      f.*,
      row_number() OVER (ORDER BY f.id DESC) AS rn
    FROM filtered f
  ),
  rows_ordered AS (
    SELECT
      r.id,
      r.doc_no,
      r.title,
      r.status,
      r.remarks,
      r.drafted_at,
      r.completed_at,
      r.doc_type,
      r.writer_id,
      r.dept_id,
      r.current_line_no,
      coalesce(r.cal_approver_line, '-') AS approver_line_names,
      r.writer_user_name,
      r.dept_name,
      r.outbound_request_id
    FROM ranked r
    CROSS JOIN lim
    WHERE r.rn > lim.off_n
      AND r.rn <= lim.off_n + lim.lim_n
  )
  SELECT jsonb_build_object(
    'total', (SELECT c FROM tot),
    'items', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id DESC)
        FROM rows_ordered r
      ),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.approval_inbox_query(
  text, text, text, date, text, text, text, int, int
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approval_inbox_query(
  text, text, text, date, text, text, text, int, int
) TO authenticated;

COMMIT;

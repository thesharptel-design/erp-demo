BEGIN;

CREATE OR REPLACE FUNCTION public.next_employee_no(p_now timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_yy text := to_char(p_now, 'YY');
  v_year_seq integer := 0;
  v_global_seq integer := 0;
BEGIN
  SELECT count(*)
    INTO v_year_seq
    FROM public.app_users
   WHERE to_char(COALESCE(created_at, now()), 'YY') = v_yy;

  SELECT count(*)
    INTO v_global_seq
    FROM public.app_users;

  RETURN v_yy || '-' || lpad((v_year_seq + 1)::text, 4, '0') || '-' || lpad((v_global_seq + 1)::text, 5, '0');
END;
$$;

WITH ranked AS (
  SELECT
    id,
    to_char(COALESCE(created_at, now()), 'YY') AS yy,
    row_number() OVER (
      PARTITION BY to_char(COALESCE(created_at, now()), 'YY')
      ORDER BY COALESCE(created_at, now()), id
    ) AS yearly_seq,
    row_number() OVER (
      ORDER BY COALESCE(created_at, now()), id
    ) AS global_seq
  FROM public.app_users
)
UPDATE public.app_users u
   SET employee_no = r.yy || '-' || lpad(r.yearly_seq::text, 4, '0') || '-' || lpad(r.global_seq::text, 5, '0')
  FROM ranked r
 WHERE u.id = r.id;

COMMIT;

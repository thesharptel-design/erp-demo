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
  -- Serialize number allocation to avoid duplicate values under concurrency.
  PERFORM pg_advisory_xact_lock(hashtext('public.app_users.employee_no'));

  SELECT
    COALESCE(
      max(
        CASE
          WHEN employee_no ~ '^[0-9]{2}-[0-9]{4}-[0-9]{5}$'
          THEN split_part(employee_no, '-', 2)::int
          ELSE NULL
        END
      ),
      0
    )
  INTO v_year_seq
  FROM public.app_users
  WHERE split_part(employee_no, '-', 1) = v_yy;

  SELECT
    COALESCE(
      max(
        CASE
          WHEN employee_no ~ '^[0-9]{2}-[0-9]{4}-[0-9]{5}$'
          THEN split_part(employee_no, '-', 3)::int
          ELSE NULL
        END
      ),
      0
    )
  INTO v_global_seq
  FROM public.app_users;

  RETURN v_yy || '-' || lpad((v_year_seq + 1)::text, 4, '0') || '-' || lpad((v_global_seq + 1)::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_employee_no_on_app_users()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employee_no IS NULL OR btrim(NEW.employee_no) = '' THEN
    NEW.employee_no := public.next_employee_no(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_users_ensure_employee_no ON public.app_users;
CREATE TRIGGER trg_app_users_ensure_employee_no
BEFORE INSERT OR UPDATE OF employee_no ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_employee_no_on_app_users();

COMMIT;

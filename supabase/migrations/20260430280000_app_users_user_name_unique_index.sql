-- Ensure display name uniqueness for signup suffixing logic.
DO $$
DECLARE
  user_row RECORD;
  base_name text;
  candidate_name text;
  suffix_no integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.app_users.user_name.dedupe'));

  FOR user_row IN
    SELECT id, btrim(user_name) AS normalized_name
    FROM public.app_users
    WHERE user_name IS NOT NULL
      AND btrim(user_name) <> ''
    ORDER BY created_at NULLS LAST, id
  LOOP
    base_name := user_row.normalized_name;
    candidate_name := base_name;
    suffix_no := 2;

    WHILE EXISTS (
      SELECT 1
      FROM public.app_users u
      WHERE u.id <> user_row.id
        AND u.user_name = candidate_name
    ) LOOP
      candidate_name := base_name || suffix_no::text;
      suffix_no := suffix_no + 1;
    END LOOP;

    UPDATE public.app_users
    SET user_name = candidate_name
    WHERE id = user_row.id
      AND user_name IS DISTINCT FROM candidate_name;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_user_name
  ON public.app_users (user_name)
  WHERE user_name IS NOT NULL
    AND btrim(user_name) <> '';

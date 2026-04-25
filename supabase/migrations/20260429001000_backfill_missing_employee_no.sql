BEGIN;

WITH existing_max AS (
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
    ) AS max_global_seq
  FROM public.app_users
  WHERE employee_no IS NOT NULL
),
existing_year_max AS (
  SELECT
    split_part(employee_no, '-', 1) AS yy,
    max(split_part(employee_no, '-', 2)::int) AS max_yearly_seq
  FROM public.app_users
  WHERE employee_no ~ '^[0-9]{2}-[0-9]{4}-[0-9]{5}$'
  GROUP BY 1
),
targets AS (
  SELECT
    u.id,
    to_char(COALESCE(u.created_at, now()), 'YY') AS yy,
    row_number() OVER (
      ORDER BY COALESCE(u.created_at, now()), u.id
    ) AS global_offset,
    row_number() OVER (
      PARTITION BY to_char(COALESCE(u.created_at, now()), 'YY')
      ORDER BY COALESCE(u.created_at, now()), u.id
    ) AS yearly_offset
  FROM public.app_users u
  WHERE u.employee_no IS NULL
),
resolved AS (
  SELECT
    t.id,
    t.yy
      || '-'
      || lpad((COALESCE(y.max_yearly_seq, 0) + t.yearly_offset)::text, 4, '0')
      || '-'
      || lpad((e.max_global_seq + t.global_offset)::text, 5, '0') AS next_employee_no
  FROM targets t
  CROSS JOIN existing_max e
  LEFT JOIN existing_year_max y
    ON y.yy = t.yy
)
UPDATE public.app_users u
SET employee_no = r.next_employee_no
FROM resolved r
WHERE u.id = r.id
  AND u.employee_no IS NULL;

COMMIT;

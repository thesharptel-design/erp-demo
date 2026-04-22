-- 학생·교사 등 조직 부서가 없는 작성자도 기안 상신 가능하도록 dept_id NULL 허용
BEGIN;

ALTER TABLE public.approval_docs
  ALTER COLUMN dept_id DROP NOT NULL;

COMMIT;

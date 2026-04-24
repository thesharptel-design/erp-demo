-- Board post/comment delete + soft-delete: only app_users.role_name = 'admin'
-- (is_system_admin_user also matches can_admin_manage / can_manage_permissions — too broad for moderation.)

BEGIN;

CREATE OR REPLACE FUNCTION public.is_erp_role_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = p_user_id
      AND lower(trim(COALESCE(u.role_name, ''))) = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_erp_role_admin_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_erp_role_admin_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_erp_role_admin_user(uuid) TO service_role;

DROP POLICY IF EXISTS board_posts_delete_authenticated ON public.board_posts;
CREATE POLICY board_posts_delete_authenticated
ON public.board_posts
FOR DELETE
TO authenticated
USING (public.is_erp_role_admin_user(auth.uid()));

DROP POLICY IF EXISTS board_comments_delete_authenticated ON public.board_comments;
CREATE POLICY board_comments_delete_authenticated
ON public.board_comments
FOR DELETE
TO authenticated
USING (public.is_erp_role_admin_user(auth.uid()));

CREATE OR REPLACE FUNCTION public.board_comments_enforce_soft_delete_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_deleted IS TRUE AND COALESCE(OLD.is_deleted, false) IS NOT TRUE THEN
    IF NOT public.is_erp_role_admin_user(auth.uid()) THEN
      RAISE EXCEPTION '댓글 삭제(숨김) 처리는 관리자(role: admin)만 할 수 있습니다.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;

-- Restrict board post/comment deletion to system admins only (UI + API parity).

BEGIN;

DROP POLICY IF EXISTS board_posts_delete_authenticated ON public.board_posts;
CREATE POLICY board_posts_delete_authenticated
ON public.board_posts
FOR DELETE
TO authenticated
USING (public.is_system_admin_user(auth.uid()));

DROP POLICY IF EXISTS board_comments_delete_authenticated ON public.board_comments;
CREATE POLICY board_comments_delete_authenticated
ON public.board_comments
FOR DELETE
TO authenticated
USING (public.is_system_admin_user(auth.uid()));

-- Block non-admins from soft-deleting comments (is_deleted := true).
CREATE OR REPLACE FUNCTION public.board_comments_enforce_soft_delete_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_deleted IS TRUE AND COALESCE(OLD.is_deleted, false) IS NOT TRUE THEN
    IF NOT public.is_system_admin_user(auth.uid()) THEN
      RAISE EXCEPTION '댓글 삭제(숨김) 처리는 시스템관리자만 할 수 있습니다.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_board_comments_soft_delete_admin_only ON public.board_comments;
CREATE TRIGGER trg_board_comments_soft_delete_admin_only
BEFORE UPDATE OF is_deleted ON public.board_comments
FOR EACH ROW
EXECUTE FUNCTION public.board_comments_enforce_soft_delete_admin_only();

COMMIT;

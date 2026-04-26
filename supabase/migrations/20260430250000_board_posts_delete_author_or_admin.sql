-- 게시글 삭제: 작성자 본인 또는 ERP role 관리자(role_name = admin)

BEGIN;

DROP POLICY IF EXISTS board_posts_delete_authenticated ON public.board_posts;

CREATE POLICY board_posts_delete_authenticated
ON public.board_posts
FOR DELETE
TO authenticated
USING (
  author_id = auth.uid()
  OR public.is_erp_role_admin_user(auth.uid())
);

COMMIT;

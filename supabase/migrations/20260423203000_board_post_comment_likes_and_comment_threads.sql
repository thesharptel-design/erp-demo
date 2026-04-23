-- Post/comment likes, comment threads (parent_id), sync triggers, RLS.

BEGIN;

-- ---------------------------------------------------------------------------
-- board_posts.like_count
-- ---------------------------------------------------------------------------
ALTER TABLE public.board_posts
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.board_posts
  DROP CONSTRAINT IF EXISTS board_posts_like_count_nonnegative;

ALTER TABLE public.board_posts
  ADD CONSTRAINT board_posts_like_count_nonnegative CHECK (like_count >= 0);

-- ---------------------------------------------------------------------------
-- board_comments: thread + like_count
-- ---------------------------------------------------------------------------
ALTER TABLE public.board_comments
  ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES public.board_comments (id) ON DELETE CASCADE;

ALTER TABLE public.board_comments
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.board_comments
  DROP CONSTRAINT IF EXISTS board_comments_like_count_nonnegative;

ALTER TABLE public.board_comments
  ADD CONSTRAINT board_comments_like_count_nonnegative CHECK (like_count >= 0);

CREATE INDEX IF NOT EXISTS idx_board_comments_parent_id
  ON public.board_comments (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.board_comments_enforce_same_post_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_post uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT post_id INTO v_parent_post
  FROM public.board_comments
  WHERE id = NEW.parent_id;

  IF v_parent_post IS NULL THEN
    RAISE EXCEPTION 'parent comment not found';
  END IF;

  IF v_parent_post <> NEW.post_id THEN
    RAISE EXCEPTION 'parent comment belongs to a different post';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_board_comments_same_post_parent ON public.board_comments;
CREATE TRIGGER trg_board_comments_same_post_parent
BEFORE INSERT OR UPDATE OF parent_id, post_id ON public.board_comments
FOR EACH ROW
EXECUTE FUNCTION public.board_comments_enforce_same_post_parent();

-- ---------------------------------------------------------------------------
-- board_post_likes (one row per user per post)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_post_likes (
  post_id uuid NOT NULL REFERENCES public.board_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE OR REPLACE FUNCTION public.board_post_likes_sync_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.board_posts
    SET like_count = like_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.board_posts
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.board_post_likes_sync_count() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_board_post_likes_sync_count ON public.board_post_likes;
CREATE TRIGGER trg_board_post_likes_sync_count
AFTER INSERT OR DELETE ON public.board_post_likes
FOR EACH ROW
EXECUTE FUNCTION public.board_post_likes_sync_count();

ALTER TABLE public.board_post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_post_likes_select_authenticated ON public.board_post_likes;
CREATE POLICY board_post_likes_select_authenticated
ON public.board_post_likes
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS board_post_likes_insert_authenticated ON public.board_post_likes;
CREATE POLICY board_post_likes_insert_authenticated
ON public.board_post_likes
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS board_post_likes_delete_authenticated ON public.board_post_likes;
CREATE POLICY board_post_likes_delete_authenticated
ON public.board_post_likes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.board_post_likes TO authenticated;

-- ---------------------------------------------------------------------------
-- board_comment_likes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_comment_likes (
  comment_id bigint NOT NULL REFERENCES public.board_comments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE OR REPLACE FUNCTION public.board_comment_likes_sync_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.board_comments
    SET like_count = like_count + 1
    WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.board_comments
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.board_comment_likes_sync_count() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_board_comment_likes_sync_count ON public.board_comment_likes;
CREATE TRIGGER trg_board_comment_likes_sync_count
AFTER INSERT OR DELETE ON public.board_comment_likes
FOR EACH ROW
EXECUTE FUNCTION public.board_comment_likes_sync_count();

ALTER TABLE public.board_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_comment_likes_select_authenticated ON public.board_comment_likes;
CREATE POLICY board_comment_likes_select_authenticated
ON public.board_comment_likes
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS board_comment_likes_insert_authenticated ON public.board_comment_likes;
CREATE POLICY board_comment_likes_insert_authenticated
ON public.board_comment_likes
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS board_comment_likes_delete_authenticated ON public.board_comment_likes;
CREATE POLICY board_comment_likes_delete_authenticated
ON public.board_comment_likes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.board_comment_likes TO authenticated;

COMMIT;

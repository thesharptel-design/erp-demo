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
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approval_doc_writer(p_doc_id bigint, p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.approval_docs d
     WHERE d.id = p_doc_id
       AND d.writer_id = p_uid
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approval_doc_participant(p_doc_id bigint, p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.approval_participants p
     WHERE p.approval_doc_id = p_doc_id
       AND p.user_id = p_uid
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
    OR public.is_approval_doc_participant(p_doc_id, p_uid);
$$;

CREATE OR REPLACE FUNCTION public.can_read_approval_participant(p_participant_id bigint, p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.approval_participants p
      LEFT JOIN public.approval_docs d ON d.id = p.approval_doc_id
     WHERE p.id = p_participant_id
       AND (
         public.is_approval_admin(p_uid)
         OR p.user_id = p_uid
         OR d.writer_id = p_uid
       )
  );
$$;

REVOKE ALL ON FUNCTION public.is_approval_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approval_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approval_admin(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_approval_doc_writer(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approval_doc_writer(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approval_doc_writer(bigint, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_approval_doc_participant(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approval_doc_participant(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approval_doc_participant(bigint, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.can_read_approval_doc(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_approval_doc(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_approval_doc(bigint, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.can_read_approval_participant(bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_approval_participant(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_approval_participant(bigint, uuid) TO service_role;

DROP POLICY IF EXISTS approval_docs_select_policy ON public.approval_docs;
CREATE POLICY approval_docs_select_policy
ON public.approval_docs
FOR SELECT
TO authenticated
USING (public.can_read_approval_doc(id, auth.uid()));

DROP POLICY IF EXISTS approval_participants_select_policy ON public.approval_participants;
CREATE POLICY approval_participants_select_policy
ON public.approval_participants
FOR SELECT
TO authenticated
USING (public.can_read_approval_participant(id, auth.uid()));

DROP POLICY IF EXISTS approval_docs_insert_policy ON public.approval_docs;
CREATE POLICY approval_docs_insert_policy
ON public.approval_docs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_approval_admin(auth.uid())
    OR writer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS approval_docs_update_policy ON public.approval_docs;
CREATE POLICY approval_docs_update_policy
ON public.approval_docs
FOR UPDATE
TO authenticated
USING (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(id, auth.uid())
)
WITH CHECK (
  public.is_approval_admin(auth.uid())
  OR writer_id = auth.uid()
);

DROP POLICY IF EXISTS approval_docs_delete_policy ON public.approval_docs;
CREATE POLICY approval_docs_delete_policy
ON public.approval_docs
FOR DELETE
TO authenticated
USING (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(id, auth.uid())
);

DROP POLICY IF EXISTS approval_participants_insert_policy ON public.approval_participants;
CREATE POLICY approval_participants_insert_policy
ON public.approval_participants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_approval_admin(auth.uid())
    OR public.is_approval_doc_writer(approval_doc_id, auth.uid())
  )
);

DROP POLICY IF EXISTS approval_participants_update_policy ON public.approval_participants;
CREATE POLICY approval_participants_update_policy
ON public.approval_participants
FOR UPDATE
TO authenticated
USING (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(approval_doc_id, auth.uid())
)
WITH CHECK (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(approval_doc_id, auth.uid())
);

DROP POLICY IF EXISTS approval_participants_delete_policy ON public.approval_participants;
CREATE POLICY approval_participants_delete_policy
ON public.approval_participants
FOR DELETE
TO authenticated
USING (
  public.is_approval_admin(auth.uid())
  OR public.is_approval_doc_writer(approval_doc_id, auth.uid())
);

COMMIT;

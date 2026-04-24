-- 기안자 삭제: 반려·회수(임시저장) 복귀만 허용. 출고(outbound_requests)는 RLS DELETE 부재 시
-- approval_docs CASCADE 삭제가 막히므로 동일 조건의 DELETE 정책 추가.

BEGIN;

DROP POLICY IF EXISTS approval_docs_delete_policy ON public.approval_docs;
CREATE POLICY approval_docs_delete_policy
ON public.approval_docs
FOR DELETE
TO authenticated
USING (
  public.is_approval_admin(auth.uid())
  OR (
    public.is_approval_doc_writer(id, auth.uid())
    AND (
      status = 'rejected'
      OR (
        status = 'draft'
        AND coalesce(remarks, '') LIKE '%기안 회수됨%'
      )
    )
  )
);

CREATE POLICY outbound_requests_delete_for_approval_doc_cascade_policy
ON public.outbound_requests
FOR DELETE
TO authenticated
USING (
  public.is_approval_admin(auth.uid())
  OR EXISTS (
    SELECT 1
      FROM public.approval_docs d
     WHERE d.id = outbound_requests.approval_doc_id
       AND d.writer_id = auth.uid()
       AND (
         d.status = 'rejected'
         OR (
           d.status = 'draft'
           AND coalesce(d.remarks, '') LIKE '%기안 회수됨%'
         )
       )
  )
);

COMMIT;

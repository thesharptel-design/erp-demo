BEGIN;

CREATE TABLE IF NOT EXISTS public.inbound_tracking_completions (
  id bigserial PRIMARY KEY,
  inventory_id bigint NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  inventory_transaction_id bigint NULL REFERENCES public.inventory_transactions(id) ON DELETE SET NULL,
  item_id bigint NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  warehouse_id bigint NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  before_lot_no text NULL,
  before_exp_date date NULL,
  before_serial_no text NULL,
  after_lot_no text NULL,
  after_exp_date date NULL,
  after_serial_no text NULL,
  actor_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_tracking_completions_inventory_id
  ON public.inbound_tracking_completions (inventory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_in_missing_tracking
  ON public.inventory_transactions (warehouse_id, item_id, trans_date DESC, id DESC)
  WHERE trans_type = 'IN'
    AND (lot_no IS NULL OR exp_date IS NULL OR serial_no IS NULL);

CREATE OR REPLACE FUNCTION public.execute_inbound_tracking_completion(
  p_inventory_id bigint,
  p_inventory_transaction_id bigint,
  p_actor_id uuid,
  p_reason text,
  p_lot_no text DEFAULT NULL,
  p_exp_date date DEFAULT NULL,
  p_serial_no text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.inventory%ROWTYPE;
  v_item public.items%ROWTYPE;
  v_tx public.inventory_transactions%ROWTYPE;
  v_lot_no text := nullif(trim(coalesce(p_lot_no, '')), '');
  v_serial_no text := nullif(trim(coalesce(p_serial_no, '')), '');
  v_reason text := trim(coalesce(p_reason, ''));
  v_target_tx_id bigint;
  v_conflict_inventory_id bigint;
  v_log_id bigint;
BEGIN
  IF p_inventory_id IS NULL OR p_inventory_id <= 0 THEN
    RAISE EXCEPTION '보완 대상 재고가 올바르지 않습니다.';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION '처리자 정보가 없습니다.';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION '보완 사유를 입력하십시오.';
  END IF;

  SELECT *
    INTO v_inventory
    FROM public.inventory
   WHERE id = p_inventory_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '보완 대상 재고를 찾을 수 없습니다.';
  END IF;

  SELECT *
    INTO v_item
    FROM public.items
   WHERE id = v_inventory.item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '품목 정보를 찾을 수 없습니다.';
  END IF;

  IF coalesce(v_item.is_lot_managed, false) AND v_lot_no IS NULL THEN
    RAISE EXCEPTION 'LOT 관리 품목은 LOT 번호가 필수입니다.';
  END IF;
  IF coalesce(v_item.is_exp_managed, false) AND p_exp_date IS NULL THEN
    RAISE EXCEPTION 'EXP 관리 품목은 유효기간이 필수입니다.';
  END IF;
  IF coalesce(v_item.is_sn_managed, false) AND v_serial_no IS NULL THEN
    RAISE EXCEPTION 'S/N 관리 품목은 시리얼 번호가 필수입니다.';
  END IF;

  SELECT id
    INTO v_conflict_inventory_id
    FROM public.inventory
   WHERE id <> p_inventory_id
     AND item_id = v_inventory.item_id
     AND warehouse_id = v_inventory.warehouse_id
     AND lot_no IS NOT DISTINCT FROM v_lot_no
     AND exp_date IS NOT DISTINCT FROM p_exp_date
     AND serial_no IS NOT DISTINCT FROM v_serial_no
   LIMIT 1;

  IF v_conflict_inventory_id IS NOT NULL THEN
    RAISE EXCEPTION '동일 추적키(LOT/EXP/SN)의 재고가 이미 존재합니다.';
  END IF;

  UPDATE public.inventory
     SET lot_no = v_lot_no,
         exp_date = p_exp_date,
         serial_no = v_serial_no,
         updated_at = now()
   WHERE id = p_inventory_id;

  IF p_inventory_transaction_id IS NOT NULL AND p_inventory_transaction_id > 0 THEN
    SELECT *
      INTO v_tx
      FROM public.inventory_transactions
     WHERE id = p_inventory_transaction_id
       AND inventory_id = p_inventory_id
       AND trans_type = 'IN'
     FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    SELECT *
      INTO v_tx
      FROM public.inventory_transactions
     WHERE inventory_id = p_inventory_id
       AND trans_type = 'IN'
     ORDER BY trans_date DESC, id DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF FOUND THEN
    v_target_tx_id := v_tx.id;
    UPDATE public.inventory_transactions
       SET lot_no = v_lot_no,
           exp_date = p_exp_date,
           serial_no = v_serial_no
     WHERE id = v_target_tx_id;
  END IF;

  INSERT INTO public.inbound_tracking_completions (
    inventory_id,
    inventory_transaction_id,
    item_id,
    warehouse_id,
    reason,
    before_lot_no,
    before_exp_date,
    before_serial_no,
    after_lot_no,
    after_exp_date,
    after_serial_no,
    actor_id
  ) VALUES (
    p_inventory_id,
    v_target_tx_id,
    v_inventory.item_id,
    v_inventory.warehouse_id,
    v_reason,
    v_inventory.lot_no,
    v_inventory.exp_date,
    v_inventory.serial_no,
    v_lot_no,
    p_exp_date,
    v_serial_no,
    p_actor_id
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'completion_id', v_log_id,
    'inventory_id', p_inventory_id,
    'inventory_transaction_id', v_target_tx_id,
    'lot_no', v_lot_no,
    'exp_date', p_exp_date,
    'serial_no', v_serial_no
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_inbound_tracking_completion(bigint, bigint, uuid, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_inbound_tracking_completion(bigint, bigint, uuid, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_inbound_tracking_completion(bigint, bigint, uuid, text, text, date, text) TO service_role;

COMMIT;

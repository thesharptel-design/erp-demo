BEGIN;

CREATE OR REPLACE FUNCTION public.execute_inbound_tracking_completion(
  p_inventory_id bigint,
  p_inventory_transaction_id bigint,
  p_complete_qty numeric,
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
  v_target public.inventory%ROWTYPE;
  v_lot_no text := nullif(trim(coalesce(p_lot_no, '')), '');
  v_serial_no text := nullif(trim(coalesce(p_serial_no, '')), '');
  v_reason text := trim(coalesce(p_reason, ''));
  v_qty numeric := coalesce(p_complete_qty, 0);
  v_target_tx_id bigint;
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
  IF v_qty <= 0 THEN
    RAISE EXCEPTION '보완 수량은 0보다 커야 합니다.';
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

  IF coalesce(v_item.is_lot_managed, false) OR coalesce(v_item.is_exp_managed, false) OR coalesce(v_item.is_sn_managed, false) THEN
    IF v_qty <> 1 THEN
      RAISE EXCEPTION '추적정보 보완은 1개 단위로만 처리할 수 있습니다.';
    END IF;
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
  IF v_qty > coalesce(v_inventory.current_qty, 0) THEN
    RAISE EXCEPTION '보완 수량이 잔여 수량을 초과했습니다.';
  END IF;

  SELECT *
    INTO v_target
    FROM public.inventory
   WHERE id <> v_inventory.id
     AND item_id = v_inventory.item_id
     AND warehouse_id = v_inventory.warehouse_id
     AND lot_no IS NOT DISTINCT FROM v_lot_no
     AND exp_date IS NOT DISTINCT FROM p_exp_date
     AND serial_no IS NOT DISTINCT FROM v_serial_no
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.inventory
       SET current_qty = coalesce(current_qty, 0) + v_qty,
           available_qty = coalesce(available_qty, 0) + v_qty,
           updated_at = now()
     WHERE id = v_target.id;
  ELSE
    INSERT INTO public.inventory (
      item_id,
      warehouse_id,
      lot_no,
      exp_date,
      serial_no,
      current_qty,
      available_qty,
      quarantine_qty,
      updated_at
    ) VALUES (
      v_inventory.item_id,
      v_inventory.warehouse_id,
      v_lot_no,
      p_exp_date,
      v_serial_no,
      v_qty,
      v_qty,
      0,
      now()
    )
    RETURNING * INTO v_target;
  END IF;

  UPDATE public.inventory
     SET current_qty = GREATEST(coalesce(current_qty, 0) - v_qty, 0),
         available_qty = GREATEST(coalesce(available_qty, 0) - v_qty, 0),
         updated_at = now()
   WHERE id = v_inventory.id;

  IF p_inventory_transaction_id IS NOT NULL AND p_inventory_transaction_id > 0 THEN
    SELECT *
      INTO v_tx
      FROM public.inventory_transactions
     WHERE id = p_inventory_transaction_id
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
    completed_qty,
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
    v_qty,
    p_actor_id
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'completion_id', v_log_id,
    'source_inventory_id', p_inventory_id,
    'target_inventory_id', v_target.id,
    'completed_qty', v_qty,
    'lot_no', v_lot_no,
    'exp_date', p_exp_date,
    'serial_no', v_serial_no
  );
END;
$$;

COMMIT;

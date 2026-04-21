BEGIN;

-- 창고별 재고를 허용하도록 추적키 유니크를 재정의.
-- (기존 키가 warehouse_id를 포함하지 않으면 창고 간 동일 LOT/SN 이동/입고 시 충돌 발생)
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_unique_tracking_key;
DROP INDEX IF EXISTS public.inventory_unique_tracking_key;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_unique_tracking_key
ON public.inventory (
  warehouse_id,
  item_id,
  COALESCE(NULLIF(lot_no, ''), '__NULL__'),
  exp_date,
  COALESCE(NULLIF(serial_no, ''), '__NULL__')
);

COMMIT;

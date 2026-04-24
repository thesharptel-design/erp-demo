BEGIN;

-- System-admin(role=admin) only access for warehouses table.
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warehouses_select_policy ON public.warehouses;
CREATE POLICY warehouses_select_policy
ON public.warehouses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND lower(COALESCE(u.role_name, '')) = 'admin'
  )
);

DROP POLICY IF EXISTS warehouses_write_policy ON public.warehouses;
CREATE POLICY warehouses_write_policy
ON public.warehouses
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND lower(COALESCE(u.role_name, '')) = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND lower(COALESCE(u.role_name, '')) = 'admin'
  )
);

-- Increase warehouse cap from 20 to 100.
CREATE OR REPLACE FUNCTION public.guard_warehouse_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.warehouses;
  IF v_count >= 100 THEN
    RAISE EXCEPTION 'Maximum warehouses reached (100)';
  END IF;
  RETURN NEW;
END;
$$;

-- Block deletion when any stock remains.
CREATE OR REPLACE FUNCTION public.guard_warehouse_delete_when_stock_exists()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_qty numeric;
BEGIN
  SELECT COALESCE(sum(COALESCE(i.current_qty, 0)), 0)
    INTO v_total_qty
    FROM public.inventory i
   WHERE i.warehouse_id = OLD.id;

  IF v_total_qty > 0 THEN
    RAISE EXCEPTION 'cannot delete warehouse: stock > 0';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_warehouse_delete_when_stock_exists ON public.warehouses;
CREATE TRIGGER trg_guard_warehouse_delete_when_stock_exists
BEFORE DELETE ON public.warehouses
FOR EACH ROW
EXECUTE FUNCTION public.guard_warehouse_delete_when_stock_exists();

-- Normalize existing WH-xx -> WH-0xx.
UPDATE public.warehouses
SET code = 'WH-' || lpad((substring(code from 'WH-(\d{1,3})'))::integer::text, 3, '0')
WHERE code ~ '^WH-\d{1,3}$'
  AND code !~ '^WH-\d{3}$';

COMMIT;

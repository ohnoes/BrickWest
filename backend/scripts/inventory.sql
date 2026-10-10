-- Ingredient & packaging inventory with lot traceability (issue #7).
-- Stock is never stored directly: on-hand is always SUM(quantity) over the
-- append-only ledger, so any historical stock level can be reproduced.
CREATE TABLE IF NOT EXISTS suppliers (
 id SERIAL PRIMARY KEY,
 name VARCHAR(200) NOT NULL UNIQUE,
 contact TEXT,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_items (
 id SERIAL PRIMARY KEY,
 sku VARCHAR(64) NOT NULL UNIQUE,
 name VARCHAR(200) NOT NULL,
 category VARCHAR(20) NOT NULL CHECK(category IN ('ingredient','packaging')),
 unit VARCHAR(20) NOT NULL,
 reorder_point NUMERIC(12,3) CHECK(reorder_point IS NULL OR reorder_point >= 0),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS inventory_lots (
 id SERIAL PRIMARY KEY,
 item_id INTEGER NOT NULL REFERENCES inventory_items(id),
 supplier_id INTEGER REFERENCES suppliers(id),
 lot_number VARCHAR(100) NOT NULL,
 expires_on DATE,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(item_id, lot_number)
);
CREATE TABLE IF NOT EXISTS inventory_ledger (
 id BIGSERIAL PRIMARY KEY,
 lot_id INTEGER NOT NULL REFERENCES inventory_lots(id),
 item_id INTEGER NOT NULL REFERENCES inventory_items(id),
 txn_type VARCHAR(10) NOT NULL CHECK(txn_type IN ('receive','adjust','consume','waste')),
 quantity NUMERIC(12,3) NOT NULL CHECK(quantity <> 0),
 batch_id INTEGER REFERENCES batches(id),
 reason TEXT,
 negative_override BOOLEAN NOT NULL DEFAULT FALSE,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(txn_type <> 'receive' OR quantity > 0),
 CHECK(txn_type NOT IN ('consume','waste') OR quantity < 0),
 CHECK(txn_type <> 'consume' OR batch_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS inventory_ledger_lot ON inventory_ledger(lot_id, created_at);
CREATE INDEX IF NOT EXISTS inventory_ledger_item ON inventory_ledger(item_id, created_at);
CREATE INDEX IF NOT EXISTS inventory_ledger_batch ON inventory_ledger(batch_id) WHERE batch_id IS NOT NULL;

-- Ledger rows are immutable; corrections are new 'adjust' rows.
CREATE OR REPLACE FUNCTION inventory_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'inventory_ledger is append-only; post an adjustment instead';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS inventory_ledger_no_change ON inventory_ledger;
CREATE TRIGGER inventory_ledger_no_change BEFORE UPDATE OR DELETE ON inventory_ledger
 FOR EACH ROW EXECUTE FUNCTION inventory_ledger_immutable();

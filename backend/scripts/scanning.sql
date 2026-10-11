CREATE TABLE IF NOT EXISTS storage_areas (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES storage_areas(id);
CREATE INDEX IF NOT EXISTS inventory_lots_area ON inventory_lots(area_id);

-- A code identifies exactly one real record. Codes are never reused, even
-- after retirement, to avoid an old physical label identifying something else.
CREATE TABLE IF NOT EXISTS scan_labels (
  id SERIAL PRIMARY KEY,
  code VARCHAR(256) NOT NULL UNIQUE,
  item_id INTEGER REFERENCES inventory_items(id),
  lot_id INTEGER REFERENCES inventory_lots(id),
  vessel_id INTEGER REFERENCES vessels(id),
  area_id INTEGER REFERENCES storage_areas(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(item_id, lot_id, vessel_id, area_id) = 1)
);
CREATE TABLE IF NOT EXISTS lot_location_events (
  id BIGSERIAL PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES inventory_lots(id),
  from_area_id INTEGER REFERENCES storage_areas(id),
  to_area_id INTEGER REFERENCES storage_areas(id),
  changed_by INTEGER NOT NULL REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

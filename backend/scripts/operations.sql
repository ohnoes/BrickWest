-- Apply once after the existing base schema.
CREATE TABLE IF NOT EXISTS vessels (
 id SERIAL PRIMARY KEY,
 name VARCHAR(100) NOT NULL UNIQUE,
 capacity_liters NUMERIC(10,2) CHECK(capacity_liters > 0),
 active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS vessel_assignments (
 id SERIAL PRIMARY KEY,
 vessel_id INTEGER NOT NULL REFERENCES vessels(id),
 batch_id INTEGER NOT NULL REFERENCES batches(id),
 assigned_by INTEGER REFERENCES users(id),
 assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 released_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_batch_per_vessel ON vessel_assignments(vessel_id) WHERE released_at IS NULL;
CREATE TABLE IF NOT EXISTS brewery_tasks (
 id SERIAL PRIMARY KEY,
 title VARCHAR(200) NOT NULL,
 description TEXT,
 batch_id INTEGER REFERENCES batches(id),
 vessel_id INTEGER REFERENCES vessels(id),
 assigned_to INTEGER REFERENCES users(id),
 created_by INTEGER NOT NULL REFERENCES users(id),
 due_at TIMESTAMPTZ,
 status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','cancelled')),
 completed_at TIMESTAMPTZ,
 completed_by INTEGER REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brewery_tasks_due ON brewery_tasks(due_at) WHERE status IN ('open','in_progress');

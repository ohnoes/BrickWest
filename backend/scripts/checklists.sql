-- Brew-day SOP checklists.
-- A template is never edited in place: saving changes creates the next version
-- and retires the previous one, so a finished checklist always shows the steps
-- the operator actually followed.
CREATE TABLE IF NOT EXISTS checklist_templates (
 id SERIAL PRIMARY KEY,
 name VARCHAR(200) NOT NULL,
 stage VARCHAR(50),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(name, version)
);
CREATE TABLE IF NOT EXISTS checklist_template_steps (
 id SERIAL PRIMARY KEY,
 template_id INTEGER NOT NULL REFERENCES checklist_templates(id),
 position INTEGER NOT NULL CHECK(position > 0),
 title VARCHAR(300) NOT NULL,
 requires_value BOOLEAN NOT NULL DEFAULT FALSE,
 value_unit VARCHAR(20),
 value_min NUMERIC(12,4),
 value_max NUMERIC(12,4),
 UNIQUE(template_id, position),
 CHECK(value_min IS NULL OR value_max IS NULL OR value_min <= value_max)
);

-- One run of a template against a batch. The unique pair makes "start" safe
-- to retry after a dropped connection.
CREATE TABLE IF NOT EXISTS batch_checklists (
 id SERIAL PRIMARY KEY,
 batch_id INTEGER NOT NULL REFERENCES batches(id),
 template_id INTEGER NOT NULL REFERENCES checklist_templates(id),
 started_by INTEGER NOT NULL REFERENCES users(id),
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(batch_id, template_id)
);
CREATE INDEX IF NOT EXISTS batch_checklists_batch ON batch_checklists(batch_id);

-- Append-only record of everything done to a step. The latest event for a
-- step is its current state; earlier events are the audit history.
-- client_event_id is generated on the device, so a retried upload of the same
-- action is recognised and stored once.
CREATE TABLE IF NOT EXISTS checklist_step_events (
 id BIGSERIAL PRIMARY KEY,
 batch_checklist_id INTEGER NOT NULL REFERENCES batch_checklists(id),
 step_id INTEGER NOT NULL REFERENCES checklist_template_steps(id),
 status VARCHAR(12) NOT NULL CHECK(status IN ('done','skipped','exception','reopened')),
 measured_value NUMERIC(12,4),
 out_of_range BOOLEAN NOT NULL DEFAULT FALSE,
 note TEXT,
 operator_id INTEGER NOT NULL REFERENCES users(id),
 client_event_id UUID NOT NULL UNIQUE,
 performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(status NOT IN ('skipped','exception','reopened') OR note IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS checklist_step_events_run ON checklist_step_events(batch_checklist_id, step_id, id);

CREATE OR REPLACE FUNCTION checklist_step_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'checklist_step_events is append-only; record a new event instead';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS checklist_step_events_no_change ON checklist_step_events;
CREATE TRIGGER checklist_step_events_no_change BEFORE UPDATE OR DELETE ON checklist_step_events
 FOR EACH ROW EXECUTE FUNCTION checklist_step_events_immutable();

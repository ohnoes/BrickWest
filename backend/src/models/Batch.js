import { query } from '../db.js';

export const getBatches = async (limit = 50, offset = 0, filters = {}) => {
  let sql = `SELECT * FROM batches WHERE deleted_at IS NULL`;
  let params = [];
  let paramCount = 1;

  if (filters.status) {
    sql += ` AND status = $${paramCount}`;
    params.push(filters.status);
    paramCount++;
  }

  if (filters.recipe_id) {
    sql += ` AND recipe_id = $${paramCount}`;
    params.push(filters.recipe_id);
    paramCount++;
  }

  if (filters.brewer_id) {
    sql += ` AND brewer_id = $${paramCount}`;
    params.push(filters.brewer_id);
    paramCount++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  return query(sql, params);
};

export const getBatchById = async (id) => {
  return query(
    `SELECT * FROM batches WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
};

export const createBatch = async (brewerId, data) => {
  const {
    recipe_id,
    batch_number,
    brew_date,
    volume_produced,
    notes
  } = data;

  return query(
    `INSERT INTO batches (brewer_id, recipe_id, batch_number, brew_date, volume_produced, status, notes)
     VALUES ($1, $2, $3, $4, $5, 'milling', $6)
     RETURNING *`,
    [brewerId, recipe_id, batch_number, brew_date, volume_produced, notes]
  );
};

export const updateBatchStatus = async (id, status) => {
  return query(
    `UPDATE batches 
     SET status = $2, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, status]
  );
};

export const logBatchPhase = async (batchId, phase, data) => {
  const { temperature, gravity, ph, notes, measured_at } = data;

  return query(
    `INSERT INTO batch_logs (batch_id, phase, temperature, gravity, ph, notes, measured_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))`,
    [batchId, phase, temperature, gravity, ph, notes, measured_at]
  );
};

export const getBatchLogs = async (batchId) => {
  return query(
    `SELECT * FROM batch_logs 
     WHERE batch_id = $1 
     ORDER BY measured_at ASC`,
    [batchId]
  );
};

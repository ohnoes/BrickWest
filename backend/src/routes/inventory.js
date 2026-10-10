import express from 'express';
import pool from '../db.js';
import { auth } from '../middleware/auth.js';
import { parseMovement, checkStock, compareRecipeUsage } from '../services/inventory.js';

const router = express.Router();
router.use(auth);
const isId = value => /^[1-9]\d*$/.test(String(value));
const bad = (res, message) => res.status(400).json({ error: message });
const isDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const text = (v, max) => typeof v === 'string' && v.trim() && v.length <= max;

// ---- Suppliers -------------------------------------------------------------
router.get('/suppliers', async (_req, res, next) => {
  try { res.json((await pool.query('SELECT * FROM suppliers WHERE active ORDER BY name')).rows); }
  catch (err) { next(err); }
});

router.post('/suppliers', async (req, res, next) => {
  try {
    const { name, contact } = req.body;
    if (!text(name, 200)) return bad(res, 'Invalid supplier name');
    res.status(201).json((await pool.query('INSERT INTO suppliers(name,contact) VALUES($1,$2) RETURNING *', [name.trim(), contact ?? null])).rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Supplier already exists' });
    next(err);
  }
});

// ---- Items (SKUs) ----------------------------------------------------------
// ?as_of=ISO timestamp reproduces historical stock from the ledger.
router.get('/items', async (req, res, next) => {
  try {
    const asOf = req.query.as_of;
    if (asOf != null && !isDate(asOf)) return bad(res, 'Invalid as_of timestamp');
    const { rows } = await pool.query(
      `SELECT i.*, COALESCE(SUM(l.quantity),0)::float AS on_hand,
              (i.reorder_point IS NOT NULL AND COALESCE(SUM(l.quantity),0) <= i.reorder_point) AS below_reorder
         FROM inventory_items i
         LEFT JOIN inventory_ledger l ON l.item_id=i.id AND ($1::timestamptz IS NULL OR l.created_at <= $1::timestamptz)
        WHERE i.active
        GROUP BY i.id ORDER BY i.category, i.name`, [asOf ?? null]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/items', async (req, res, next) => {
  try {
    const { sku, name, category, unit, reorder_point } = req.body;
    if (!text(sku, 64) || !text(name, 200) || !text(unit, 20)) return bad(res, 'sku, name and unit are required');
    if (!['ingredient', 'packaging'].includes(category)) return bad(res, 'category must be ingredient or packaging');
    if (reorder_point != null && !(Number(reorder_point) >= 0)) return bad(res, 'Invalid reorder_point');
    res.status(201).json((await pool.query(
      'INSERT INTO inventory_items(sku,name,category,unit,reorder_point) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [sku.trim(), name.trim(), category, unit.trim(), reorder_point ?? null])).rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'SKU already exists' });
    next(err);
  }
});

router.get('/items/:id/lots', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid item ID');
    const { rows } = await pool.query(
      `SELECT lot.*, s.name AS supplier_name, COALESCE(SUM(l.quantity),0)::float AS on_hand
         FROM inventory_lots lot
         LEFT JOIN suppliers s ON s.id=lot.supplier_id
         LEFT JOIN inventory_ledger l ON l.lot_id=lot.id
        WHERE lot.item_id=$1
        GROUP BY lot.id, s.name
        ORDER BY lot.expires_on ASC NULLS LAST, lot.received_at`, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ---- Receiving -------------------------------------------------------------
router.post('/receive', async (req, res, next) => {
  const { item_id, supplier_id, lot_number, quantity, expires_on, reason } = req.body;
  if (!isId(item_id) || (supplier_id != null && !isId(supplier_id))) return bad(res, 'Invalid item or supplier ID');
  if (!text(lot_number, 100)) return bad(res, 'lot_number is required');
  if (!(Number(quantity) > 0)) return bad(res, 'quantity must be positive');
  if (expires_on != null && !isDate(expires_on)) return bad(res, 'Invalid expires_on date');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const item = await client.query('SELECT id FROM inventory_items WHERE id=$1 AND active', [item_id]);
    if (!item.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item not found' }); }
    const lot = (await client.query(
      `INSERT INTO inventory_lots(item_id,supplier_id,lot_number,expires_on) VALUES($1,$2,$3,$4)
       ON CONFLICT (item_id, lot_number) DO UPDATE SET supplier_id=COALESCE(inventory_lots.supplier_id, EXCLUDED.supplier_id),
         expires_on=COALESCE(inventory_lots.expires_on, EXCLUDED.expires_on)
       RETURNING *`, [item_id, supplier_id ?? null, lot_number.trim(), expires_on ?? null])).rows[0];
    const entry = (await client.query(
      `INSERT INTO inventory_ledger(lot_id,item_id,txn_type,quantity,reason,created_by)
       VALUES($1,$2,'receive',$3,$4,$5) RETURNING *`, [lot.id, item_id, Number(quantity), reason ?? null, req.user.id])).rows[0];
    await client.query('COMMIT');
    res.status(201).json({ lot, entry });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ---- Adjust / consume / waste ----------------------------------------------
router.post('/movements', async (req, res, next) => {
  const parsed = parseMovement(req.body);
  if (parsed.error) return bad(res, parsed.error);
  const m = parsed.value;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the lot so concurrent movements can't both pass the stock check.
    const lot = await client.query('SELECT id, item_id FROM inventory_lots WHERE id=$1 FOR UPDATE', [m.lot_id]);
    if (!lot.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Lot not found' }); }
    if (m.batch_id != null) {
      const batch = await client.query('SELECT id FROM batches WHERE id=$1 AND deleted_at IS NULL', [m.batch_id]);
      if (!batch.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Batch not found' }); }
    }
    const onHand = Number((await client.query('SELECT COALESCE(SUM(quantity),0) AS q FROM inventory_ledger WHERE lot_id=$1', [m.lot_id])).rows[0].q);
    const check = checkStock(onHand, m.quantity, { override: m.override, role: req.user.role });
    if (!check.ok) { await client.query('ROLLBACK'); return res.status(check.status).json({ error: check.error, on_hand: onHand }); }
    const entry = (await client.query(
      `INSERT INTO inventory_ledger(lot_id,item_id,txn_type,quantity,batch_id,reason,negative_override,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [m.lot_id, lot.rows[0].item_id, m.type, m.quantity, m.batch_id, m.reason, check.overridden, req.user.id])).rows[0];
    await client.query('COMMIT');
    res.status(201).json({ entry, on_hand: check.after });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

router.get('/ledger', async (req, res, next) => {
  try {
    const { item_id, lot_id, batch_id } = req.query;
    if ([item_id, lot_id, batch_id].some(v => v != null && !isId(v))) return bad(res, 'Invalid filter ID');
    const { rows } = await pool.query(
      `SELECT l.*, i.sku, i.name AS item_name, lot.lot_number, b.batch_number
         FROM inventory_ledger l
         JOIN inventory_items i ON i.id=l.item_id
         JOIN inventory_lots lot ON lot.id=l.lot_id
         LEFT JOIN batches b ON b.id=l.batch_id
        WHERE ($1::int IS NULL OR l.item_id=$1) AND ($2::int IS NULL OR l.lot_id=$2) AND ($3::int IS NULL OR l.batch_id=$3)
        ORDER BY l.created_at DESC, l.id DESC LIMIT 500`, [item_id ?? null, lot_id ?? null, batch_id ?? null]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ---- Traceability ----------------------------------------------------------
// Which batches did this lot go into?
router.get('/lots/:id/trace', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid lot ID');
    const lot = await pool.query(
      `SELECT lot.*, i.sku, i.name AS item_name, i.unit, s.name AS supplier_name
         FROM inventory_lots lot JOIN inventory_items i ON i.id=lot.item_id LEFT JOIN suppliers s ON s.id=lot.supplier_id
        WHERE lot.id=$1`, [req.params.id]);
    if (!lot.rowCount) return res.status(404).json({ error: 'Lot not found' });
    const batches = await pool.query(
      `SELECT b.id, b.batch_number, b.status, b.brew_date, (-SUM(l.quantity))::float AS quantity_used,
              MIN(l.created_at) AS first_used_at, MAX(l.created_at) AS last_used_at
         FROM inventory_ledger l JOIN batches b ON b.id=l.batch_id
        WHERE l.lot_id=$1 AND l.txn_type='consume'
        GROUP BY b.id ORDER BY first_used_at`, [req.params.id]);
    res.json({ lot: lot.rows[0], batches: batches.rows });
  } catch (err) { next(err); }
});

// Recipe vs actual for a batch, plus the lots it consumed.
router.get('/batches/:id/usage', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid batch ID');
    const batch = await pool.query(
      `SELECT b.id, b.batch_number, b.volume_produced, r.id AS recipe_id, r.name AS recipe_name, r.volume_liters, r.ingredients
         FROM batches b LEFT JOIN recipes r ON r.id=b.recipe_id WHERE b.id=$1 AND b.deleted_at IS NULL`, [req.params.id]);
    if (!batch.rowCount) return res.status(404).json({ error: 'Batch not found' });
    const b = batch.rows[0];
    const [actual, lots] = await Promise.all([
      pool.query(
        `SELECT i.sku, i.name, i.unit, (-SUM(l.quantity))::float AS consumed
           FROM inventory_ledger l JOIN inventory_items i ON i.id=l.item_id
          WHERE l.batch_id=$1 AND l.txn_type='consume' GROUP BY i.id ORDER BY i.name`, [b.id]),
      pool.query(
        `SELECT lot.id AS lot_id, lot.lot_number, i.sku, i.name, (-SUM(l.quantity))::float AS consumed
           FROM inventory_ledger l JOIN inventory_lots lot ON lot.id=l.lot_id JOIN inventory_items i ON i.id=l.item_id
          WHERE l.batch_id=$1 AND l.txn_type='consume' GROUP BY lot.id, i.id ORDER BY i.name, lot.lot_number`, [b.id]),
    ]);
    const comparison = compareRecipeUsage(b.ingredients, actual.rows, { recipeVolume: b.volume_liters, batchVolume: b.volume_produced });
    res.json({ batch: { id: b.id, batch_number: b.batch_number, recipe_id: b.recipe_id, recipe_name: b.recipe_name }, ...comparison, lots: lots.rows });
  } catch (err) { next(err); }
});

export default router;

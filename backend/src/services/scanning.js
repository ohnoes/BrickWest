import { randomUUID } from 'node:crypto';
import { badRequest, HttpError, parseId, requiredString } from '../http.js';

export const TARGETS = { item: 'inventory_items', lot: 'inventory_lots', vessel: 'vessels', area: 'storage_areas' };
export function parseCode(value) {
  // Preserve leading zeros and case: product barcodes are identifiers, not numbers.
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 256 || [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw badRequest('Invalid label code');
  }
  return value.trim();
}

export async function createLabel(db, body, userId) {
  const kind = requiredString(body, 'kind', 20);
  if (!Object.hasOwn(TARGETS, kind)) throw badRequest('Invalid label target');
  const id = parseId(body.target_id, 'target ID');
  const code = body.code == null ? `bw:${randomUUID()}` : parseCode(body.code);
  const active = ['item', 'vessel'].includes(kind) ? ' AND active' : '';
  const target = await db.query(`SELECT id FROM ${TARGETS[kind]} WHERE id=$1${active}`, [id]);
  if (!target.rowCount) throw new HttpError(404, 'Target not found');
  return (await db.query(
    `INSERT INTO scan_labels(code,${kind}_id,created_by) VALUES($1,$2,$3) RETURNING *`, [code, id, userId])).rows[0];
}

const LOTS = `SELECT lot.*, i.name AS item_name, i.sku, i.unit, a.name AS area_name,
  COALESCE(SUM(l.quantity),0)::float AS on_hand,
  (lot.expires_on < CURRENT_DATE) AS expired,
  (lot.expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS expires_soon
  FROM inventory_lots lot JOIN inventory_items i ON i.id=lot.item_id
  LEFT JOIN storage_areas a ON a.id=lot.area_id
  LEFT JOIN inventory_ledger l ON l.lot_id=lot.id`;

export async function resolveCode(db, rawCode) {
  const code = parseCode(rawCode);
  const label = (await db.query('SELECT * FROM scan_labels WHERE code=$1 AND active', [code])).rows[0];
  if (!label) throw new HttpError(404, 'Label not registered or retired');
  const kind = Object.keys(TARGETS).find(k => label[`${k}_id`] != null);
  if (!kind) throw new HttpError(404, 'Label target not found');
  const id = label[`${kind}_id`];
  const active = ['item', 'vessel'].includes(kind) ? ' AND active' : '';
  const target = (await db.query(`SELECT * FROM ${TARGETS[kind]} WHERE id=$1${active}`, [id])).rows[0];
  if (!target) throw new HttpError(404, 'Label target not found');
  if (kind === 'vessel') {
    const batch = (await db.query(`SELECT b.id,b.batch_number,b.status,b.volume_produced
      FROM vessel_assignments a JOIN batches b ON b.id=a.batch_id
      WHERE a.vessel_id=$1 AND a.released_at IS NULL AND b.deleted_at IS NULL`, [id])).rows[0] ?? null;
    return { label, kind, target, batch, lots: [], reminders: [] };
  }
  const filter = { item: 'lot.item_id', lot: 'lot.id', area: 'lot.area_id' }[kind];
  const lots = (await db.query(`${LOTS} WHERE ${filter}=$1 AND i.active
    GROUP BY lot.id,i.id,a.id ORDER BY lot.expires_on ASC NULLS LAST,lot.received_at,lot.id`, [id])).rows;
  const reminders = lots.filter(l => l.on_hand > 0 && (l.expired || l.expires_soon)).map(l => ({
    type: l.expired ? 'expired' : 'expires_soon', lot_id: l.id, message: `${l.item_name} · ${l.lot_number}: ${l.expired ? 'expired' : 'expires within 7 days'}`
  }));
  const onHand = kind === 'item' ? lots.reduce((sum, l) => sum + l.on_hand, 0) : null;
  if (kind === 'item' && target.reorder_point != null && onHand <= Number(target.reorder_point)) {
    reminders.push({ type: 'reorder', message: `${target.name} is at or below its reorder point` });
  }
  return { label, kind, target, lots, on_hand: onHand, reminders };
}

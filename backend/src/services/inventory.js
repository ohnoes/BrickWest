// Pure inventory rules, kept free of database access so they are easy to test.

export const OVERRIDE_ROLES = ['admin', 'head_brewer'];
export const TXN_TYPES = ['adjust', 'consume', 'waste'];

const num = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) ? Number(v) : NaN;
const isId = v => /^[1-9]\d*$/.test(String(v));

// Validate a stock movement and return the signed ledger quantity.
// consume/waste take a positive amount and are stored negative;
// adjust takes a signed amount (positive found stock, negative shrink).
export function parseMovement(body = {}) {
  const { type, lot_id, batch_id, reason, override } = body;
  if (!TXN_TYPES.includes(type)) return { error: `type must be one of ${TXN_TYPES.join(', ')}` };
  if (!isId(lot_id)) return { error: 'Invalid lot_id' };
  const amount = num(body.quantity);
  if (!Number.isFinite(amount) || amount === 0) return { error: 'quantity must be a non-zero number' };
  if (type !== 'adjust' && amount < 0) return { error: `${type} quantity must be positive` };
  if (type === 'consume' && !isId(batch_id)) return { error: 'consume requires a batch_id' };
  if (batch_id != null && !isId(batch_id)) return { error: 'Invalid batch_id' };
  if (type === 'adjust' && !(typeof reason === 'string' && reason.trim())) return { error: 'adjust requires a reason' };
  if (override && !(typeof reason === 'string' && reason.trim())) return { error: 'override requires a reason' };
  return {
    value: {
      type,
      lot_id: Number(lot_id),
      batch_id: batch_id == null ? null : Number(batch_id),
      quantity: type === 'adjust' ? amount : -amount,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
      override: Boolean(override),
    },
  };
}

// Decide whether a movement may proceed given the lot's current on-hand.
export function checkStock(onHand, delta, { override = false, role } = {}) {
  const after = Number(onHand) + Number(delta);
  if (after >= 0 || delta > 0) return { ok: true, after, overridden: false };
  if (!override) return { ok: false, status: 409, after, error: `Insufficient stock: ${Number(onHand)} on hand, would go to ${after}` };
  if (!OVERRIDE_ROLES.includes(role)) return { ok: false, status: 403, after, error: 'Negative stock override requires an admin or head brewer' };
  return { ok: true, after, overridden: true };
}

const norm = s => String(s ?? '').trim().toLowerCase();

// Compare recipe ingredient amounts (scaled to the batch volume when known)
// against actual consumption from the ledger. Recipe ingredients are free-form
// JSON, so match on sku first, then name; unmatched rows show up on either side.
export function compareRecipeUsage(recipeIngredients, actualRows, { recipeVolume, batchVolume } = {}) {
  const list = Array.isArray(recipeIngredients) ? recipeIngredients : [];
  const scale = Number(recipeVolume) > 0 && Number(batchVolume) > 0 ? Number(batchVolume) / Number(recipeVolume) : 1;
  const remaining = actualRows.map(r => ({ ...r, used: false }));
  const lines = list.map(ing => {
    const planned = num(ing.amount ?? ing.quantity);
    const match = remaining.find(r => !r.used && ((ing.sku && norm(r.sku) === norm(ing.sku)) || norm(r.name) === norm(ing.name)));
    if (match) match.used = true;
    const plannedScaled = Number.isFinite(planned) ? +(planned * scale).toFixed(3) : null;
    const actual = match ? Number(match.consumed) : 0;
    return {
      name: ing.name ?? ing.sku ?? null,
      sku: match?.sku ?? ing.sku ?? null,
      unit: ing.unit ?? match?.unit ?? null,
      planned: plannedScaled,
      actual,
      variance: plannedScaled == null ? null : +(actual - plannedScaled).toFixed(3),
    };
  });
  for (const r of remaining.filter(r => !r.used)) {
    lines.push({ name: r.name, sku: r.sku, unit: r.unit, planned: null, actual: Number(r.consumed), variance: null });
  }
  return { scale, lines };
}

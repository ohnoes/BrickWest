import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMovement, checkStock, compareRecipeUsage } from '../src/services/inventory.js';

test('consume and waste are stored as negative quantities', () => {
  assert.equal(parseMovement({ type: 'consume', lot_id: 1, batch_id: 2, quantity: 5 }).value.quantity, -5);
  assert.equal(parseMovement({ type: 'waste', lot_id: 1, quantity: '2.5' }).value.quantity, -2.5);
  assert.equal(parseMovement({ type: 'adjust', lot_id: 1, quantity: -3, reason: 'cycle count' }).value.quantity, -3);
});

test('movement validation rejects bad input', () => {
  assert.match(parseMovement({ type: 'consume', lot_id: 1, quantity: 5 }).error, /batch_id/);
  assert.match(parseMovement({ type: 'consume', lot_id: 1, batch_id: 2, quantity: -5 }).error, /positive/);
  assert.match(parseMovement({ type: 'adjust', lot_id: 1, quantity: 1 }).error, /reason/);
  assert.match(parseMovement({ type: 'waste', lot_id: 1, quantity: 1, override: true }).error, /reason/);
  assert.match(parseMovement({ type: 'receive', lot_id: 1, quantity: 1 }).error, /type/);
  assert.match(parseMovement({ type: 'waste', lot_id: 'x', quantity: 1 }).error, /lot_id/);
  assert.match(parseMovement({ type: 'waste', lot_id: 1, quantity: 0 }).error, /non-zero/);
});

test('negative stock is blocked unless an authorized override is given', () => {
  assert.equal(checkStock(10, -4).ok, true);
  assert.equal(checkStock(3, -4).status, 409);
  assert.equal(checkStock(3, -4, { override: true, role: 'brewer' }).status, 403);
  const ok = checkStock(3, -4, { override: true, role: 'admin' });
  assert.equal(ok.ok, true);
  assert.equal(ok.overridden, true);
  assert.equal(ok.after, -1);
  assert.equal(checkStock(-2, 5).ok, true); // positive adjustments always allowed
});

test('recipe versus actual scales to batch volume and surfaces unplanned usage', () => {
  const recipe = [{ name: 'Pilsner Malt', amount: 100, unit: 'kg' }, { sku: 'HOP-CIT', name: 'Citra', amount: 2, unit: 'kg' }];
  const actual = [
    { sku: 'MALT-PILS', name: 'pilsner malt', unit: 'kg', consumed: 210 },
    { sku: 'HOP-CIT', name: 'Citra Pellets', unit: 'kg', consumed: 4.5 },
    { sku: 'CAN-16', name: '16oz Can', unit: 'ea', consumed: 300 },
  ];
  const { scale, lines } = compareRecipeUsage(recipe, actual, { recipeVolume: 1000, batchVolume: 2000 });
  assert.equal(scale, 2);
  assert.deepEqual(lines[0], { name: 'Pilsner Malt', sku: 'MALT-PILS', unit: 'kg', planned: 200, actual: 210, variance: 10 });
  assert.equal(lines[1].variance, 0.5);
  assert.equal(lines[2].planned, null);
  assert.equal(lines[2].actual, 300);
});

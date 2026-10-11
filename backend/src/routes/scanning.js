import express from 'express';
import QRCode from 'qrcode';
import pool from '../db.js';
import { auth } from '../middleware/auth.js';
import { wrap, requireBody, requiredString, parseId, optionalId, HttpError, badRequest } from '../http.js';
import { createLabel, resolveCode } from '../services/scanning.js';

export function createScanRouter(db = pool) {
  const router = express.Router();
  router.use(auth);
  router.post('/resolve', requireBody, wrap(async (req, res) => {
    res.json(await resolveCode(db, req.body.code));
  }));
  router.get('/targets', wrap(async (_req, res) => {
    res.json((await db.query(`SELECT 'item' AS kind,id,name FROM inventory_items WHERE active
      UNION ALL SELECT 'lot',lot.id,i.name || ' · ' || lot.lot_number FROM inventory_lots lot JOIN inventory_items i ON i.id=lot.item_id WHERE i.active
      UNION ALL SELECT 'vessel',id,name FROM vessels WHERE active
      UNION ALL SELECT 'area',id,name FROM storage_areas ORDER BY kind,name`)).rows);
  }));
  router.get('/labels', wrap(async (_req, res) => {
    res.json((await db.query(`SELECT t.*,
      COALESCE(i.name, lot.lot_number, v.name, a.name) AS target_name
      FROM scan_labels t LEFT JOIN inventory_items i ON i.id=t.item_id
      LEFT JOIN inventory_lots lot ON lot.id=t.lot_id LEFT JOIN vessels v ON v.id=t.vessel_id
      LEFT JOIN storage_areas a ON a.id=t.area_id WHERE t.active ORDER BY t.id DESC LIMIT 500`)).rows);
  }));
  router.post('/labels', requireBody, wrap(async (req, res) => {
    res.status(201).json(await createLabel(db, req.body, req.user.id));
  }));
  router.delete('/labels/:id', wrap(async (req, res) => {
    const result = await db.query('UPDATE scan_labels SET active=false WHERE id=$1 AND active RETURNING id', [parseId(req.params.id)]);
    if (!result.rowCount) throw new HttpError(404, 'Label not found');
    res.json({ retired: true });
  }));
  router.get('/labels/:id/qr', wrap(async (req, res) => {
    const { rows } = await db.query('SELECT code FROM scan_labels WHERE id=$1 AND active', [parseId(req.params.id)]);
    if (!rows[0]) throw new HttpError(404, 'Label not found');
    // Data only: the generated SVG contains QR rectangles, never user markup.
    res.type('image/svg+xml').send(await QRCode.toString(rows[0].code, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }));
  }));
  router.get('/areas', wrap(async (_req, res) => {
    res.json((await db.query('SELECT * FROM storage_areas ORDER BY name')).rows);
  }));
  router.get('/labels/:id/qr-image', wrap(async (req, res) => {
    const { rows } = await db.query('SELECT code FROM scan_labels WHERE id=$1 AND active', [parseId(req.params.id)]);
    if (!rows[0]) throw new HttpError(404, 'Label not found');
    res.json({ image: await QRCode.toDataURL(rows[0].code, { errorCorrectionLevel: 'M', margin: 4, width: 300 }) });
  }));
  router.post('/areas', requireBody, wrap(async (req, res) => {
    res.status(201).json((await db.query('INSERT INTO storage_areas(name,created_by) VALUES($1,$2) RETURNING *',
      [requiredString(req.body, 'name', 100), req.user.id])).rows[0]);
  }));
  router.patch('/lots/:id/area', requireBody, wrap(async (req, res) => {
    const lotId = parseId(req.params.id, 'lot ID');
    if (!Object.hasOwn(req.body, 'area_id')) throw badRequest('area_id is required; use null to clear');
    const areaId = optionalId(req.body.area_id, 'area ID');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const lot = (await client.query('SELECT id,area_id FROM inventory_lots WHERE id=$1 FOR UPDATE', [lotId])).rows[0];
      if (!lot) throw new HttpError(404, 'Lot not found');
      if (areaId != null && !(await client.query('SELECT id FROM storage_areas WHERE id=$1', [areaId])).rowCount) {
        throw new HttpError(404, 'Area not found');
      }
      if (lot.area_id !== areaId) {
        await client.query('INSERT INTO lot_location_events(lot_id,from_area_id,to_area_id,changed_by) VALUES($1,$2,$3,$4)',
          [lotId, lot.area_id, areaId, req.user.id]);
        await client.query('UPDATE inventory_lots SET area_id=$2 WHERE id=$1', [lotId, areaId]);
      }
      await client.query('COMMIT');
      res.json({ lot_id: lotId, area_id: areaId });
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }));
  return router;
}
export default createScanRouter();

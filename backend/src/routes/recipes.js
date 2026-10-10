import express from 'express';
import * as Recipe from '../models/Recipe.js';
import { auth } from '../middleware/auth.js';
import {
  HttpError, badRequest, optionalNumber, optionalString, parseId, parsePagination,
  requireBody, requiredString, wrap
} from '../http.js';

const router = express.Router();
router.use(auth);

const notFound = () => new HttpError(404, 'Recipe not found');

const readRecipe = (body, { partial }) => {
  const { ingredients } = body;
  if (ingredients != null && typeof ingredients !== 'object') throw badRequest('Invalid ingredients');
  let name;
  if (partial && body.name == null) name = undefined;
  else name = requiredString(body, 'name', 255);
  return {
    name,
    style: optionalString(body, 'style', 100),
    target_abv: optionalNumber(body, 'target_abv', { min: 0, max: 100 }),
    target_ibu: optionalNumber(body, 'target_ibu', { min: 0, max: 1000 }),
    volume_liters: optionalNumber(body, 'volume_liters', { min: 0, exclusiveMin: true, max: 999999 }),
    ingredients,
    notes: optionalString(body, 'notes', 10000)
  };
};

router.get('/', wrap(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const result = await Recipe.getRecipes(limit, offset);
  res.json(result.rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const result = await Recipe.getRecipeById(parseId(req.params.id, 'recipe ID'));
  if (result.rows.length === 0) throw notFound();
  res.json(result.rows[0]);
}));

router.post('/', requireBody, wrap(async (req, res) => {
  const result = await Recipe.createRecipe(req.user.id, readRecipe(req.body, { partial: false }));
  res.status(201).json(result.rows[0]);
}));

router.put('/:id', requireBody, wrap(async (req, res) => {
  const id = parseId(req.params.id, 'recipe ID');
  const result = await Recipe.updateRecipe(id, readRecipe(req.body, { partial: true }));
  if (result.rows.length === 0) throw notFound();
  res.json(result.rows[0]);
}));

router.delete('/:id', wrap(async (req, res) => {
  const result = await Recipe.deleteRecipe(parseId(req.params.id, 'recipe ID'));
  if (result.rows.length === 0) throw notFound();
  res.json({ deleted: true });
}));

export default router;

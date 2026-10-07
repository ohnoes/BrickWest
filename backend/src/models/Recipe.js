import { query } from '../db.js';

export const getRecipes = async (limit = 50, offset = 0) => {
  return query(
    `SELECT * FROM recipes 
     WHERE deleted_at IS NULL 
     ORDER BY created_at DESC 
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
};

export const getRecipeById = async (id) => {
  return query(
    `SELECT * FROM recipes WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
};

export const createRecipe = async (brewerId, data) => {
  const {
    name,
    style,
    target_abv,
    target_ibu,
    volume_liters,
    ingredients,
    notes
  } = data;

  return query(
    `INSERT INTO recipes (brewer_id, name, style, target_abv, target_ibu, volume_liters, ingredients, notes, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
     RETURNING *`,
    [brewerId, name, style, target_abv, target_ibu, volume_liters, JSON.stringify(ingredients), notes]
  );
};

export const updateRecipe = async (id, data) => {
  const { name, style, target_abv, target_ibu, volume_liters, ingredients, notes } = data;
  
  return query(
    `UPDATE recipes 
     SET name = COALESCE($2, name),
         style = COALESCE($3, style),
         target_abv = COALESCE($4, target_abv),
         target_ibu = COALESCE($5, target_ibu),
         volume_liters = COALESCE($6, volume_liters),
         ingredients = COALESCE($7, ingredients),
         notes = COALESCE($8, notes),
         version = version + 1,
         updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, name, style, target_abv, target_ibu, volume_liters, ingredients ? JSON.stringify(ingredients) : null, notes]
  );
};

export const deleteRecipe = async (id) => {
  return query(
    `UPDATE recipes SET deleted_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
};

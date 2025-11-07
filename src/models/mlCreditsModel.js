// /Users/macbookpro/proyectos/dhl-guias-api/src/models/mlCreditsModel.js

/**
 * Modelo para créditos de usuarios con rol MERCADOLIBRE.
 *
 * Tabla: ml_credits
 *
 * Campos principales:
 *  - user_id
 *  - weight_min_kg
 *  - weight_max_kg
 *  - credits_total
 *  - credits_used
 *  - expires_at (nullable)
 */

const { pool } = require('../config/db');

/**
 * Obtiene todos los créditos de un usuario (sin filtrar por peso).
 * @param {number} userId
 */
async function getCreditsByUser(userId) {
  const sql = `
    SELECT *
    FROM ml_credits
    WHERE user_id = ?
    ORDER BY weight_min_kg ASC, weight_max_kg ASC, created_at DESC
  `;
  const [rows] = await pool.execute(sql, [userId]);
  return rows;
}

/**
 * Obtiene créditos disponibles de un usuario para un peso específico.
 *
 * - Filtra por:
 *   * user_id = ?
 *   * weight_min_kg <= weightKg
 *   * weight_max_kg >= weightKg
 *   * credits_total > credits_used
 *   * (expires_at IS NULL OR expires_at > NOW())
 *
 * Devuelve un arreglo de créditos que podrían usarse.
 * En la lógica de negocio, podrás elegir el primer crédito
 * o aplicar alguna estrategia (ej. el de menor rango, etc.).
 *
 * @param {number} userId
 * @param {number} weightKg
 */
async function getAvailableCreditsForUserAndWeight(userId, weightKg) {
  const sql = `
    SELECT *,
      (credits_total - credits_used) AS credits_remaining
    FROM ml_credits
    WHERE user_id = ?
      AND weight_min_kg <= ?
      AND weight_max_kg >= ?
      AND credits_total > credits_used
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY weight_min_kg ASC, weight_max_kg ASC, expires_at ASC
  `;
  const params = [userId, weightKg, weightKg];
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Crea un nuevo bloque de créditos para un usuario.
 *
 * data = {
 *   user_id: number,
 *   weight_min_kg: number,
 *   weight_max_kg: number,
 *   credits_total: number,
 *   expires_at?: Date|string|null
 * }
 */
async function createCredits(data) {
  const {
    user_id,
    weight_min_kg,
    weight_max_kg,
    credits_total,
    expires_at = null
  } = data;

  const sql = `
    INSERT INTO ml_credits
      (user_id, weight_min_kg, weight_max_kg, credits_total, credits_used, expires_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `;
  const params = [
    user_id,
    weight_min_kg,
    weight_max_kg,
    credits_total,
    expires_at
  ];

  const [result] = await pool.execute(sql, params);
  return result.insertId;
}

/**
 * Incrementa credits_used de un registro de ml_credits.
 *
 * @param {number} id - ID del registro en ml_credits
 * @param {number} amount - Cuántos créditos aumentar (por lo general 1)
 */
async function incrementUsedCredits(id, amount = 1) {
  const sql = `
    UPDATE ml_credits
    SET credits_used = credits_used + ?
    WHERE id = ?
      AND credits_used + ? <= credits_total
  `;
  const params = [amount, id, amount];
  const [result] = await pool.execute(sql, params);
  return result.affectedRows > 0;
}

/**
 * Ajusta manualmente los créditos (por ejemplo, el admin corrige saldo).
 *
 * data puede incluir:
 *  - credits_total
 *  - credits_used
 *  - expires_at
 */
async function updateCredits(id, data) {
  const fields = [];
  const params = [];

  if (data.credits_total !== undefined) {
    fields.push('credits_total = ?');
    params.push(data.credits_total);
  }
  if (data.credits_used !== undefined) {
    fields.push('credits_used = ?');
    params.push(data.credits_used);
  }
  if (data.expires_at !== undefined) {
    fields.push('expires_at = ?');
    params.push(data.expires_at);
  }

  if (fields.length === 0) {
    return;
  }

  const sql = `
    UPDATE ml_credits
    SET ${fields.join(', ')}
    WHERE id = ?
  `;
  params.push(id);

  await pool.execute(sql, params);
}

/**
 * Elimina un registro de créditos (por ejemplo, si el admin se equivocó).
 */
async function deleteCredits(id) {
  const sql = 'DELETE FROM ml_credits WHERE id = ?';
  await pool.execute(sql, [id]);
}

module.exports = {
  getCreditsByUser,
  getAvailableCreditsForUserAndWeight,
  createCredits,
  incrementUsedCredits,
  updateCredits,
  deleteCredits
};

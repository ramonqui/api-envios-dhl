// /Users/macbookpro/proyectos/dhl-guias-api/src/models/pricingModel.js

/**
 * Modelo para:
 * - pricing_rules: reglas de precio por rol y rango de peso.
 * - dhl_surcharge_config: recargos globales de DHL (zona extendida, manejo especial).
 *
 * Tablas creadas en:
 *   sql/001_pricing_and_credits.sql
 */

const { pool } = require('../config/db');

/* ==========================================================
 * PRICING_RULES
 * ========================================================== */

/**
 * Obtiene todas las reglas de precio (opcionalmente filtradas por rol).
 * @param {string|null} role - 'REVENDEDOR' | 'MAYORISTA' | 'MINORISTA' o null para todas.
 */
async function getAllPricingRules(role = null) {
  let sql = 'SELECT * FROM pricing_rules';
  const params = [];

  if (role) {
    sql += ' WHERE role = ?';
    params.push(role);
  }

  sql += ' ORDER BY role, weight_min_kg ASC, weight_max_kg ASC';

  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Obtiene la regla de precio activa para un rol y un peso específico.
 * Busca una fila donde weight_min_kg <= peso <= weight_max_kg y active = 1.
 * Si hay varias (no debería), devuelve la primera.
 *
 * @param {string} role - Rol del usuario ('REVENDEDOR','MAYORISTA','MINORISTA')
 * @param {number} weightKg - Peso en kg del envío (ej. 3.50)
 */
async function getPricingRuleForRoleAndWeight(role, weightKg) {
  const sql = `
    SELECT *
    FROM pricing_rules
    WHERE role = ?
      AND active = 1
      AND weight_min_kg <= ?
      AND weight_max_kg >= ?
    ORDER BY weight_min_kg ASC, weight_max_kg ASC
    LIMIT 1
  `;
  const params = [role, weightKg, weightKg];
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Crea una nueva regla de precio.
 *
 * data = {
 *   role: 'REVENDEDOR' | 'MAYORISTA' | 'MINORISTA',
 *   weight_min_kg: number,
 *   weight_max_kg: number,
 *   mode: 'PERCENTAGE' | 'FIXED_PRICE' | 'MARKUP_AMOUNT',
 *   value: number,
 *   currency: 'MXN',
 *   active: 1|0
 * }
 */
async function createPricingRule(data) {
  const {
    role,
    weight_min_kg,
    weight_max_kg,
    mode,
    value,
    currency = 'MXN',
    active = 1
  } = data;

  const sql = `
    INSERT INTO pricing_rules
      (role, weight_min_kg, weight_max_kg, mode, value, currency, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    role,
    weight_min_kg,
    weight_max_kg,
    mode,
    value,
    currency,
    active
  ];

  const [result] = await pool.execute(sql, params);
  return result.insertId;
}

/**
 * Actualiza una regla de precio existente por id.
 *
 * data puede contener cualquiera de estos campos:
 *   role, weight_min_kg, weight_max_kg, mode, value, currency, active
 */
async function updatePricingRule(id, data) {
  const fields = [];
  const params = [];

  if (data.role !== undefined) {
    fields.push('role = ?');
    params.push(data.role);
  }
  if (data.weight_min_kg !== undefined) {
    fields.push('weight_min_kg = ?');
    params.push(data.weight_min_kg);
  }
  if (data.weight_max_kg !== undefined) {
    fields.push('weight_max_kg = ?');
    params.push(data.weight_max_kg);
  }
  if (data.mode !== undefined) {
    fields.push('mode = ?');
    params.push(data.mode);
  }
  if (data.value !== undefined) {
    fields.push('value = ?');
    params.push(data.value);
  }
  if (data.currency !== undefined) {
    fields.push('currency = ?');
    params.push(data.currency);
  }
  if (data.active !== undefined) {
    fields.push('active = ?');
    params.push(data.active);
  }

  if (fields.length === 0) {
    // Nada que actualizar
    return;
  }

  const sql = `
    UPDATE pricing_rules
    SET ${fields.join(', ')}
    WHERE id = ?
  `;
  params.push(id);

  await pool.execute(sql, params);
}

/**
 * Elimina una regla de precio por id.
 * (Opcional: en vez de borrar podríamos desactivarla con active=0.
 *  De momento, dejamos una función para borrar.)
 */
async function deletePricingRule(id) {
  const sql = 'DELETE FROM pricing_rules WHERE id = ?';
  await pool.execute(sql, [id]);
}

/* ==========================================================
 * DHL_SURCHARGE_CONFIG
 * ========================================================== */

/**
 * Obtiene la configuración de recargos DHL.
 * Por diseño, usamos siempre el registro con id = 1.
 */
async function getDhlSurchargeConfig() {
  const sql = 'SELECT * FROM dhl_surcharge_config WHERE id = 1';
  const [rows] = await pool.execute(sql);
  if (rows.length === 0) {
    return null;
  }
  return rows[0];
}

/**
 * Actualiza la configuración de recargos DHL.
 *
 * data = {
 *   extended_area_fee?: number,
 *   special_handling_fee?: number,
 *   currency?: string
 * }
 */
async function updateDhlSurchargeConfig(data) {
  const fields = [];
  const params = [];

  if (data.extended_area_fee !== undefined) {
    fields.push('extended_area_fee = ?');
    params.push(data.extended_area_fee);
  }
  if (data.special_handling_fee !== undefined) {
    fields.push('special_handling_fee = ?');
    params.push(data.special_handling_fee);
  }
  if (data.currency !== undefined) {
    fields.push('currency = ?');
    params.push(data.currency);
  }

  if (fields.length === 0) {
    return;
  }

  const sql = `
    UPDATE dhl_surcharge_config
    SET ${fields.join(', ')}
    WHERE id = 1
  `;

  await pool.execute(sql, params);
}

module.exports = {
  // pricing_rules
  getAllPricingRules,
  getPricingRuleForRoleAndWeight,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,

  // dhl_surcharge_config
  getDhlSurchargeConfig,
  updateDhlSurchargeConfig
};

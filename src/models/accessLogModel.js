// /Users/macbookpro/proyectos/dhl-guias-api/src/models/accessLogModel.js

const { pool } = require('../config/db');

/**
 * Guarda un log de acceso (registro o login)
 * @param {Object} data
 * @param {number|null} data.user_id
 * @param {string} data.ip_address
 * @param {string|null} data.user_agent
 * @param {string|null} data.endpoint
 * @param {Object|null} data.ip_raw
 */
async function addAccessLog(data) {
  const {
    user_id = null,
    ip_address = null,
    user_agent = null,
    endpoint = null,
    ip_raw = null
  } = data;

  const sql = `
    INSERT INTO access_logs
      (user_id, ip_address, user_agent, endpoint, ip_raw)
    VALUES (?, ?, ?, ?, ?)
  `;

  const ipRawString = ip_raw ? JSON.stringify(ip_raw) : null;

  await pool.execute(sql, [
    user_id,
    ip_address,
    user_agent,
    endpoint,
    ipRawString
  ]);
}

/**
 * Devuelve el último acceso de ESA IP pero de OTRO usuario distinto al indicado.
 *
 * Esto lo usamos para aplicar la regla:
 * "Si esta IP ya la usó otro usuario y no está en whitelist -> bloquear"
 *
 * @param {string} ipAddress
 * @param {number|null} currentUserId  // en register es null, en login es el id
 * @returns {Object|null}
 */
async function getLastAccessByIpAndDifferentUser(ipAddress, currentUserId = null) {
  // si no hay IP, no tiene sentido buscar
  if (!ipAddress) return null;

  // caso 1: registro (currentUserId = null)
  if (currentUserId === null) {
    const [rows] = await pool.execute(
      `
      SELECT *
      FROM access_logs
      WHERE ip_address = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [ipAddress]
    );
    // si ya hay un log con esa IP → eso significa que otra persona ya la usó
    return rows[0] || null;
  }

  // caso 2: login (sí tenemos un user_id)
  const [rows] = await pool.execute(
    `
    SELECT *
    FROM access_logs
    WHERE ip_address = ?
      AND (user_id IS NULL OR user_id <> ?)
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [ipAddress, currentUserId]
  );

  return rows[0] || null;
}

/**
 * Lista los logs recientes (para el admin)
 */
async function getAccessLogs(limit = 100) {
  let safeLimit = parseInt(limit, 10);
  if (isNaN(safeLimit) || safeLimit <= 0) safeLimit = 100;
  if (safeLimit > 500) safeLimit = 500;

  const [rows] = await pool.query(
    `
    SELECT
      al.id,
      al.user_id,
      u.email AS user_email,
      al.ip_address,
      al.user_agent,
      al.endpoint,
      al.ip_raw,
      al.created_at
    FROM access_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.id DESC
    LIMIT ${safeLimit}
    `
  );

  return rows;
}

module.exports = {
  addAccessLog,
  getLastAccessByIpAndDifferentUser,
  getAccessLogs
};

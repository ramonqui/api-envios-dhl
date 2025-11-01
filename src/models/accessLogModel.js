const { pool } = require('../config/db');

async function createAccessLog(logData) {
  const {
    user_id,
    ip_address,
    user_agent,
    country,
    city,
    endpoint,
    ip_raw
  } = logData;

  const sql = `
    INSERT INTO access_logs
    (user_id, ip_address, user_agent, country, city, endpoint, ip_raw)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.execute(sql, [
    user_id,
    ip_address,
    user_agent,
    country,
    city,
    endpoint,
    ip_raw ? JSON.stringify(ip_raw) : null
  ]);
}

async function getAccessLogs(limit = 50) {
  let safeLimit = parseInt(limit, 10);
  if (isNaN(safeLimit) || safeLimit <= 0) safeLimit = 50;
  if (safeLimit > 500) safeLimit = 500;

  const sql = `
    SELECT
      al.id,
      al.user_id,
      al.ip_address,
      al.user_agent,
      al.country,
      al.city,
      al.endpoint,
      al.ip_raw,
      al.created_at,
      u.email,
      u.username,
      u.rol
    FROM access_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.id DESC
    LIMIT ${safeLimit}
  `;

  const [rows] = await pool.query(sql);
  return rows;
}

/**
 * Devuelve todos los user_id distintos que han usado esta IP
 * (solo los que NO son null)
 */
async function getDistinctUsersByIp(ip) {
  const sql = `
    SELECT DISTINCT user_id
    FROM access_logs
    WHERE ip_address = ?
      AND user_id IS NOT NULL
  `;
  const [rows] = await pool.execute(sql, [ip]);
  // rows = [ { user_id: 1 }, { user_id: 5 } ... ]
  return rows.map(r => r.user_id);
}

module.exports = {
  createAccessLog,
  getAccessLogs,
  getDistinctUsersByIp
};

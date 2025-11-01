const { pool } = require('../config/db');

async function isIpWhitelisted(ip) {
  const [rows] = await pool.execute(
    'SELECT * FROM ip_whitelist WHERE ip_address = ? LIMIT 1',
    [ip]
  );
  return rows.length > 0;
}

async function addIpToWhitelist(ip, descripcion = null, createdBy = null) {
  const sql = `
    INSERT INTO ip_whitelist (ip_address, descripcion, created_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      descripcion = VALUES(descripcion),
      created_by = VALUES(created_by)
  `;
  await pool.execute(sql, [ip, descripcion, createdBy]);
}

async function getWhitelistedIps() {
  const [rows] = await pool.query(
    'SELECT id, ip_address, descripcion, created_by, created_at FROM ip_whitelist ORDER BY created_at DESC'
  );
  return rows;
}

module.exports = {
  isIpWhitelisted,
  addIpToWhitelist,
  getWhitelistedIps
};

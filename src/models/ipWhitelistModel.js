// /Users/macbookpro/proyectos/dhl-guias-api/src/models/ipWhitelistModel.js

const { pool } = require('../config/db');

// ¿La IP está autorizada?
async function isIpWhitelisted(ipAddress) {
  const [rows] = await pool.execute(
    'SELECT id FROM ip_whitelist WHERE ip_address = ? LIMIT 1',
    [ipAddress]
  );
  return rows.length > 0;
}

// Agregar IP a whitelist
async function addIpToWhitelist(ipAddress, descripcion = null, createdBy = 'admin') {
  const [result] = await pool.execute(
    `
    INSERT INTO ip_whitelist (ip_address, descripcion, created_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      descripcion = VALUES(descripcion),
      created_by = VALUES(created_by)
    `,
    [ipAddress, descripcion, createdBy]
  );
  return result.insertId;
}

// Listar todas las IPs en whitelist
async function getWhitelist() {
  const [rows] = await pool.query(
    `
    SELECT id, ip_address, descripcion, created_by, created_at
    FROM ip_whitelist
    ORDER BY id DESC
    `
  );
  return rows;
}

// Alias para compatibilidad con el controlador
async function getWhitelistedIps() {
  return getWhitelist();
}

module.exports = {
  isIpWhitelisted,
  addIpToWhitelist,
  getWhitelist,
  getWhitelistedIps   // 👈 este nombre es el que te estaba fallando
};

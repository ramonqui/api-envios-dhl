// /Users/macbookpro/proyectos/dhl-guias-api/src/models/ipWhitelistModel.js

const { pool } = require('../config/db');

/**
 * WHITELIST GLOBAL
 * Estas IPs pueden usarlas varios usuarios sin restricción.
 */
async function isIpWhitelisted(ipAddress) {
  const [rows] = await pool.execute(
    'SELECT id FROM ip_whitelist WHERE ip_address = ? LIMIT 1',
    [ipAddress]
  );
  return rows.length > 0;
}

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

/**
 * WHITELIST POR USUARIO
 * Estas IPs solo las puede usar un usuario concreto.
 */

async function isIpWhitelistedForUser(userId, ipAddress) {
  const [rows] = await pool.execute(
    `
    SELECT id
    FROM ip_whitelist_users
    WHERE user_id = ? AND ip_address = ?
    LIMIT 1
    `,
    [userId, ipAddress]
  );
  return rows.length > 0;
}

async function addIpToUserWhitelist(userId, ipAddress, descripcion = null) {
  const [result] = await pool.execute(
    `
    INSERT INTO ip_whitelist_users (user_id, ip_address, descripcion)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      descripcion = VALUES(descripcion)
    `,
    [userId, ipAddress, descripcion]
  );
  return result.insertId;
}

async function getUserWhitelist(userId) {
  const [rows] = await pool.execute(
    `
    SELECT id, ip_address, descripcion, created_at
    FROM ip_whitelist_users
    WHERE user_id = ?
    ORDER BY id DESC
    `,
    [userId]
  );
  return rows;
}

module.exports = {
  // global
  isIpWhitelisted,
  addIpToWhitelist,
  getWhitelist,

  // por usuario
  isIpWhitelistedForUser,
  addIpToUserWhitelist,
  getUserWhitelist
};

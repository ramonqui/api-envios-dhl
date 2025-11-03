// /Users/macbookpro/proyectos/dhl-guias-api/src/models/passwordResetModel.js

const { pool } = require('../config/db');

async function createPasswordResetToken(userId, token, expiresAt) {
  const sql = `
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `;
  const [result] = await pool.execute(sql, [userId, token, expiresAt]);
  return result.insertId;
}

async function findValidToken(token) {
  const sql = `
    SELECT *
    FROM password_reset_tokens
    WHERE token = ?
      AND used = 0
      AND expires_at > NOW()
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [token]);
  return rows[0] || null;
}

async function markTokenAsUsed(id) {
  const sql = `
    UPDATE password_reset_tokens
    SET used = 1
    WHERE id = ?
  `;
  await pool.execute(sql, [id]);
}

module.exports = {
  createPasswordResetToken,
  findValidToken,
  markTokenAsUsed
};

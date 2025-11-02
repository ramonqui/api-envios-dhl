// /Users/macbookpro/proyectos/dhl-guias-api/src/models/userModel.js

const { pool } = require('../config/db');

// Crear usuario
async function createUser({
  nombre,
  apellido,
  email,
  username,
  country_code = '+52',
  whatsapp,
  negocio_url = null,
  password_hash,
  rol = 'MINORISTA'
}) {
  const sql = `
    INSERT INTO users
      (nombre, apellido, email, username, country_code, whatsapp, negocio_url, password_hash, rol)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.execute(sql, [
    nombre,
    apellido,
    email,
    username,
    country_code,
    whatsapp,
    negocio_url,
    password_hash,
    rol
  ]);

  return result.insertId;
}

async function findUserByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] || null;
}

async function findUserByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function findUserByWhatsapp(whatsapp) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE whatsapp = ? LIMIT 1',
    [whatsapp]
  );
  return rows[0] || null;
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserByWhatsapp
};

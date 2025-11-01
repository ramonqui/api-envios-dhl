const { pool } = require('../config/db');

async function createUser(userData) {
  const {
    nombre,
    apellido,
    email,
    username,
    whatsapp,
    negocio_url,
    password_hash,
    rol
  } = userData;

  const sql = `
    INSERT INTO users
    (nombre, apellido, email, username, whatsapp, negocio_url, password_hash, rol)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.execute(sql, [
    nombre,
    apellido,
    email,
    username,
    whatsapp,
    negocio_url,
    password_hash,
    rol
  ]);

  return result.insertId;
}

async function findUserByEmail(email) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
}

async function findUserByUsername(username) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0];
}

// 👇 nuevo: listar usuarios (solo admin)
async function getAllUsers(limit = 100) {
  let safeLimit = parseInt(limit, 10);
  if (isNaN(safeLimit) || safeLimit <= 0) safeLimit = 100;
  if (safeLimit > 500) safeLimit = 500;

  const sql = `
    SELECT
      id,
      nombre,
      apellido,
      email,
      username,
      whatsapp,
      negocio_url,
      rol,
      is_active,
      created_at
    FROM users
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `;
  const [rows] = await pool.query(sql);
  return rows;
}

// 👇 nuevo: obtener un usuario por id
async function getUserById(id) {
  const [rows] = await pool.execute(
    `SELECT id, nombre, apellido, email, username, whatsapp, negocio_url, rol, is_active, created_at
     FROM users
     WHERE id = ?`,
    [id]
  );
  return rows[0];
}

// 👇 nuevo: actualizar datos básicos
async function updateUser(id, data) {
  const fields = [];
  const values = [];

  if (data.nombre) {
    fields.push('nombre = ?');
    values.push(data.nombre);
  }
  if (data.apellido) {
    fields.push('apellido = ?');
    values.push(data.apellido);
  }
  if (data.whatsapp) {
    fields.push('whatsapp = ?');
    values.push(data.whatsapp);
  }
  if (data.negocio_url !== undefined) {
    fields.push('negocio_url = ?');
    values.push(data.negocio_url);
  }
  if (data.rol) {
    fields.push('rol = ?');
    values.push(data.rol.toUpperCase());
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(data.is_active ? 1 : 0);
  }

  if (fields.length === 0) {
    return false; // nada que actualizar
  }

  const sql = `
    UPDATE users
    SET ${fields.join(', ')}
    WHERE id = ?
  `;
  values.push(id);

  const [result] = await pool.execute(sql, values);
  return result.affectedRows > 0;
}

// 👇 nuevo: desactivar (soft delete)
async function deactivateUser(id) {
  const [result] = await pool.execute(
    'UPDATE users SET is_active = 0 WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserByUsername,
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser
};

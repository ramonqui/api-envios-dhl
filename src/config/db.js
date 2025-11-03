// /Users/macbookpro/proyectos/dhl-guias-api/src/config/db.js
const mysql = require('mysql2/promise');

const config = {
  host: process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1',
  port: process.env.MYSQLPORT ? Number(process.env.MYSQLPORT) : (process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306),
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;

try {
  pool = mysql.createPool(config);
  console.log('[DB] Pool creado');
} catch (err) {
  console.error('[DB] Error creando pool (pero seguimos levantando):', err?.message || err);
  // Creamos un "pool fake" para no romper require
  pool = {
    execute: async () => { throw new Error('DB no disponible'); },
    query: async () => { throw new Error('DB no disponible'); },
    getConnection: async () => { throw new Error('DB no disponible'); }
  };
}

module.exports = { pool };

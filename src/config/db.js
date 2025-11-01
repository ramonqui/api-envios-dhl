const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

// Creamos un pool para reutilizar conexiones
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT 1 AS result');
    connection.release();
    console.log('✅ Conexión MySQL OK:', rows[0].result);
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
  }
}

module.exports = {
  pool,
  testConnection
};

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { pool } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const protectedRoutes = require('./routes/protectedRoutes');
const userRoutes = require('./routes/userRoutes');

dotenv.config();

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', protectedRoutes);
app.use('/api/users', userRoutes);

// Ruta de prueba (para saber que el backend vive)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API DHL guías funcionando ✅',
    timestamp: new Date().toISOString()
  });
});

// Ruta para probar conexión a la BD
app.get('/api/db-health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS now');
    res.json({
      status: 'ok',
      dbTime: rows[0].now,
      message: 'Conexión a MySQL correcta ✅'
    });
  } catch (error) {
    console.error('Error en /api/db-health:', error);
    res.status(500).json({
      status: 'error',
      message: 'No se pudo conectar a MySQL',
      error: error.message
    });
  }
});

module.exports = app;

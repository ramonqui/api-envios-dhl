// /Users/macbookpro/proyectos/dhl-guias-api/src/app.js

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

// Rutas
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pricingRoutes = require('./routes/pricingRoutes');

const app = express();

/* ==============================
 * MIDDLEWARES GLOBALES
 * ============================== */

// Logs de peticiones HTTP
app.use(morgan('dev'));

// Habilitar CORS (para que el frontend pueda llamar al backend)
app.use(cors());

// Parsear JSON del body
app.use(express.json());

// Parsear datos de formularios (por si los usas más adelante)
app.use(express.urlencoded({ extended: true }));

/* ==============================
 * RUTAS BÁSICAS / SALUD
 * ============================== */

// Ruta raíz simple
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API Envios DHL - Backend operativo'
  });
});

// Healthcheck para Railway / monitoreo
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* ==============================
 * RUTAS DE LA APLICACIÓN
 * ============================== */

// Autenticación: registro, login, forgot-password, reset-password
app.use('/api/auth', authRoutes);

// Panel admin: whitelist, IPs, pruebas de correo, etc.
app.use('/api/admin', adminRoutes);

// NUEVO: módulo de pricing (cotizaciones con DHL + reglas + créditos)
app.use('/api/pricing', pricingRoutes);

/* ==============================
 * MANEJO DE 404
 * ============================== */

app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: 'Ruta no encontrada'
  });
});

/* ==============================
 * MANEJO DE ERRORES GENERALES
 * ============================== */

app.use((err, req, res, next) => {
  console.error('[ERROR GLOBAL]', err);

  res.status(500).json({
    status: 'error',
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'production'
      ? 'internal_error'
      : (err.message || 'sin mensaje')
  });
});

module.exports = app;

// /Users/macbookpro/proyectos/dhl-guias-api/src/app.js

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// -------- Middlewares base
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// -------- Healthcheck (siempre responde, no depende de DB ni de nada)
app.get('/api/health', (req, res) => {
  return res.json({
    status: 'ok',
    service: 'dhl-guias-api',
    time: new Date().toISOString()
  });
});

// -------- Montaje de rutas con protección para no crashear
function safeMount(path, loader) {
  try {
    const router = loader();
    app.use(path, router);
    console.log(`[BOOT] Rutas montadas en ${path}`);
  } catch (err) {
    console.error(`[BOOT] Error montando rutas en ${path}:`, err?.stack || err);
  }
}

safeMount('/api/auth', () => require('./routes/authRoutes'));
safeMount('/api/admin', () => require('./routes/adminRoutes'));

// -------- Handler de 404
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Ruta no encontrada' });
});

module.exports = app;

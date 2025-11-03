// /Users/macbookpro/proyectos/dhl-guias-api/src/app.js

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// Middlewares base
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Healthcheck (siempre responde)
app.get('/api/health', (req, res) => {
  return res.json({
    status: 'ok',
    service: 'dhl-guias-api',
    time: new Date().toISOString()
  });
});

// Montaje de rutas
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// 404 final
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Ruta no encontrada' });
});

module.exports = app;

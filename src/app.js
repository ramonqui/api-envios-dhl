// /Users/macbookpro/proyectos/dhl-guias-api/src/app.js

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pricingRoutes = require('./routes/pricingRoutes');

const app = express();

// Middlewares globales
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Rutas principales
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pricing', pricingRoutes);

// Healthcheck básico
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API envíos DHL funcionando'
  });
});

// 404 genérico
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Ruta no encontrada'
  });
});

module.exports = app;

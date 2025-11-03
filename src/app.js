// /Users/macbookpro/proyectos/dhl-guias-api/src/app.js

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Rutas
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Middlewares base
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Health
app.get('/api/health', (req, res) => {
  return res.json({ status: 'ok', service: 'dhl-guias-api' });
});

// Montaje de rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

module.exports = app;

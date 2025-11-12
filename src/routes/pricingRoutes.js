// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/pricingRoutes.js

const express = require('express');
const router = express.Router();

// Middleware de autenticación (JWT)
const { authMiddleware } = require('../middlewares/authMiddleware');

// Controlador de pricing: importamos directamente la función
const { quoteShipment } = require('../controllers/pricingController');

// POST /api/pricing/quote
// Protegido con JWT
router.post('/quote', authMiddleware, quoteShipment);

module.exports = router;

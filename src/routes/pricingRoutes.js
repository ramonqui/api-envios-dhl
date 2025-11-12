// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/pricingRoutes.js

const express = require('express');
const router = express.Router();

// Middleware de autenticación
const { authMiddleware } = require('../middlewares/authMiddleware');

// Controlador de pricing
const pricingController = require('../controllers/pricingController');

// POST /api/pricing/quote
// Protegido con JWT
router.post('/quote', authMiddleware, pricingController.quoteShipment);

module.exports = router;

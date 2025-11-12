// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/pricingRoutes.js

const express = require('express');
const router = express.Router();

const { quoteShipment } = require('../controllers/pricingController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// POST /api/pricing/quote
router.post('/quote', authMiddleware, quoteShipment);

module.exports = router;

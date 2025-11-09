// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/pricingRoutes.js

const express = require('express');
const router = express.Router();

const { quoteShipment } = require('../controllers/pricingController');

// POST /api/pricing/quote
router.post('/quote', quoteShipment);

module.exports = router;

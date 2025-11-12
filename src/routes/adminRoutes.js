// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/adminRoutes.js

const express = require('express');
const router = express.Router();

const adminKeyMiddleware = require('../middlewares/adminKeyMiddleware');
const {
  listAccessLogs,
  listWhitelist,
  addToWhitelist,
  addUserIpWhitelist,
  listUserIpWhitelist,
  sendAdminTestEmail,
  brevoPing,
  brevoConfig
} = require('../controllers/adminController');

// Todas las rutas de admin requieren admin key
router.use(adminKeyMiddleware);

// Logs
router.get('/logs', listAccessLogs);

// Whitelist global
router.get('/whitelist', listWhitelist);
router.post('/whitelist', addToWhitelist);

// Whitelist por usuario
router.post('/whitelist/user', addUserIpWhitelist);
router.get('/whitelist/user/:userId', listUserIpWhitelist);

// Brevo: ping a la API y config (diagnóstico)
router.get('/brevo/ping', brevoPing);
router.get('/brevo/config', brevoConfig);

// Test-email (envío de prueba con Brevo)
router.post('/test-email', sendAdminTestEmail);

module.exports = router;
const express = require('express');
const router = express.Router();

const { debugDhlConfig } = require('../controllers/adminController');

// ... tus demás rutas admin

// GET /api/admin/debug/dhl-config  (x-admin-key requerido)
router.get('/debug/dhl-config', debugDhlConfig);

module.exports = router;

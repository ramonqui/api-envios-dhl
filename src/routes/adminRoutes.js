// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/adminRoutes.js

const express = require('express');
const adminKeyMiddleware = require('../middlewares/adminKeyMiddleware');
const {
  listAccessLogs,
  listWhitelist,
  addToWhitelist,
  addUserIpWhitelist,
  listUserIpWhitelist,
  sendAdminTestEmail
} = require('../controllers/adminController');

const router = express.Router();

// Todas las rutas de admin requieren la admin key
router.use(adminKeyMiddleware);

// Logs de accesos
router.get('/logs', listAccessLogs);

// Whitelist global (IP libre para varios)
router.get('/whitelist', listWhitelist);
router.post('/whitelist', addToWhitelist);

// Whitelist por usuario (IP asociada a un usuario concreto)
router.post('/whitelist/user', addUserIpWhitelist);
router.get('/whitelist/user/:userId', listUserIpWhitelist);

// Envío de correo de prueba (para validar Brevo)
router.post('/test-email', sendAdminTestEmail);

module.exports = router;

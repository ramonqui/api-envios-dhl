// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/adminRoutes.js

const express = require('express');
const router = express.Router();

let adminKeyMiddleware;
try {
  adminKeyMiddleware = require('../middlewares/adminKeyMiddleware');
} catch (err) {
  console.error('[BOOT] No se pudo cargar adminKeyMiddleware (se bloquearán endpoints admin):', err?.message || err);
  // Middleware "dummy" para que no crashee si falta el archivo
  adminKeyMiddleware = (req, res) => res.status(503).json({ status: 'error', message: 'Admin no disponible' });
}

let controllers = {};
try {
  controllers = require('../controllers/adminController');
} catch (err) {
  console.error('[BOOT] No se pudieron cargar controladores admin:', err?.message || err);
  // Controladores "dummy" para no crashear el arranque
  controllers = {
    listAccessLogs: (req, res) => res.status(503).json({ status: 'error', message: 'Admin no disponible' }),
    listWhitelist: (req, res) => res.status(503).json({ status: 'error', message: 'Admin no disponible' }),
    addToWhitelist: (req, res) => res.status(503).json({ status: 'error', message: 'Admin no disponible' }),
    addUserIpWhitelist: (req, res) => res.status(503).json({ status: 'error', message: 'Admin no disponible' }),
    listUserIpWhitelist: (req, res) => res.status(503).json({ status: 'error', message: 'Admin no disponible' }),
    sendAdminTestEmail: (req, res) => res.status(503).json({ status: 'error', message: 'Admin no disponible' })
  };
}

// Todas las rutas de admin requieren admin key
router.use(adminKeyMiddleware);

// Logs
router.get('/logs', controllers.listAccessLogs);

// Whitelist global
router.get('/whitelist', controllers.listWhitelist);
router.post('/whitelist', controllers.addToWhitelist);

// Whitelist por usuario
router.post('/whitelist/user', controllers.addUserIpWhitelist);
router.get('/whitelist/user/:userId', controllers.listUserIpWhitelist);

// Test-email (Brevo)
router.post('/test-email', controllers.sendAdminTestEmail);

module.exports = router;

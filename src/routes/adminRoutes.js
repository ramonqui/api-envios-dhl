const express = require('express');
const adminKeyMiddleware = require('../middlewares/adminKeyMiddleware');
const {
  listAccessLogs,
  listWhitelist,
  addToWhitelist,
  addToWhitelistFromLog
} = require('../controllers/adminController');

const router = express.Router();

// Todas las rutas requieren la admin key
router.use(adminKeyMiddleware);

// GET /api/admin/logs
router.get('/logs', listAccessLogs);

// GET /api/admin/whitelist
router.get('/whitelist', listWhitelist);

// POST /api/admin/whitelist
router.post('/whitelist', addToWhitelist);

// POST /api/admin/whitelist/from-log/:ip
router.post('/whitelist/from-log/:ip', addToWhitelistFromLog);

module.exports = router;

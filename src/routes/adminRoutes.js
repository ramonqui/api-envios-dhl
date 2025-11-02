// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/adminRoutes.js

const express = require('express');
const adminKeyMiddleware = require('../middlewares/adminKeyMiddleware');

const {
  listAccessLogs,
  listWhitelist,
  addToWhitelist,
  addUserIpWhitelist,
  listUserIpWhitelist
} = require('../controllers/adminController');

const router = express.Router();

// todas las rutas de aquí requieren la admin key
router.use(adminKeyMiddleware);

// logs
router.get('/logs', listAccessLogs);

// whitelist global
router.get('/whitelist', listWhitelist);
router.post('/whitelist', addToWhitelist);

// whitelist por usuario
router.post('/whitelist/user', addUserIpWhitelist);
router.get('/whitelist/user/:userId', listUserIpWhitelist);

module.exports = router;

const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

const router = express.Router();

// Ruta solo para usuarios logueados (cualquier rol)
router.get('/me', authMiddleware, (req, res) => {
  return res.json({
    status: 'ok',
    message: 'Estás autenticado ✅',
    user: req.user
  });
});

// Ruta solo para admin
router.get('/admin-only', authMiddleware, roleMiddleware(['ADMIN']), (req, res) => {
  return res.json({
    status: 'ok',
    message: 'Bienvenido, admin 👑',
    user: req.user
  });
});

// Ruta para admin o revendedor
router.get('/panel-ventas', authMiddleware, roleMiddleware(['ADMIN', 'REVENDEDOR']), (req, res) => {
  return res.json({
    status: 'ok',
    message: 'Acceso a panel de ventas',
    user: req.user
  });
});

module.exports = router;

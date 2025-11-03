// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const { register, login, forgotPassword, resetPassword } = require('../controllers/authController');

// Registro
router.post('/register', register);

// Login
router.post('/login', login);

// Recuperar contraseña (envía correo con enlace)
router.post('/forgot-password', forgotPassword);

// Restablecer contraseña (usa token del correo)
router.post('/reset-password', resetPassword);

module.exports = router;

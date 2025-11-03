// /Users/macbookpro/proyectos/dhl-guias-api/src/routes/authRoutes.js

const express = require('express');
const { register, login, forgotPassword, resetPassword } = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

// recuperación de contraseña
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;

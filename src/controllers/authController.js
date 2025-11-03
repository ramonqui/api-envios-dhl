// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/authController.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const {
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserByWhatsapp
} = require('../models/userModel');

const {
  addAccessLog,
  getLastAccessByIpAndDifferentUser
} = require('../models/accessLogModel');

const {
  isIpWhitelisted,
  isIpWhitelistedForUser
} = require('../models/ipWhitelistModel');

const {
  createPasswordResetToken,
  findValidToken,
  markTokenAsUsed
} = require('../models/passwordResetModel');

const { getIpInfo, isSuspiciousIp } = require('../services/ipService');
const { sendPasswordResetEmail } = require('../services/emailService');

const { generateBaseUsername } = require('../utils/usernameGenerator');

// obtener IP real
function getClientIp(req) {
  const xfwd = req.headers['x-forwarded-for'];
  if (xfwd) return xfwd.split(',')[0].trim();
  if (req.ip) return req.ip;
  return req.connection?.remoteAddress || '0.0.0.0';
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      rol: user.rol
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// ========================
// REGISTRO
// ========================
async function register(req, res) {
  try {
    const {
      nombre,
      apellido,
      email,
      username,
      country_code,
      whatsapp,
      negocio_url,
      password,
      rol
    } = req.body;

    if (!nombre || !apellido || !email || !whatsapp || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Faltan campos obligatorios.'
      });
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(whatsapp)) {
      return res.status(400).json({
        status: 'error',
        field: 'whatsapp',
        message: 'El teléfono debe tener exactamente 10 dígitos numéricos (sin +52, sin espacios, sin guiones).'
      });
    }

    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({
        status: 'error',
        field: 'email',
        message: 'El correo ya está registrado.'
      });
    }

    const existingPhone = await findUserByWhatsapp(whatsapp);
    if (existingPhone) {
      return res.status(400).json({
        status: 'error',
        field: 'whatsapp',
        message: 'Este teléfono ya está registrado en otra cuenta.'
      });
    }

    const clientIp = getClientIp(req);

    let ipInfo = null;
    try {
      ipInfo = await getIpInfo(clientIp);
    } catch (err) {
      ipInfo = null;
    }

    if (isSuspiciousIp(ipInfo)) {
      return res.status(403).json({
        status: 'error',
        message: 'Acceso denegado: no se permiten conexiones desde VPN, proxy o TOR.',
        ip: clientIp
      });
    }

    const isGlobalWhite = await isIpWhitelisted(clientIp);
    if (!isGlobalWhite) {
      const lastAccessDiffUser = await getLastAccessByIpAndDifferentUser(clientIp, null);
      if (lastAccessDiffUser) {
        return res.status(403).json({
          status: 'error',
          message: 'Acceso denegado: esta dirección IP ya está registrada para otro usuario. Contacta al administrador.',
          ip: clientIp
        });
      }
    }

    // username automático
    let finalUsername = username;
    if (!finalUsername || finalUsername.trim() === '') {
      let candidate = generateBaseUsername(nombre, apellido);
      let exists = await findUserByUsername(candidate);
      let attempts = 0;
      while (exists && attempts < 5) {
        candidate = generateBaseUsername(nombre, apellido);
        exists = await findUserByUsername(candidate);
        attempts++;
      }
      if (exists) {
        candidate = `${generateBaseUsername(nombre, apellido)}${Date.now().toString().slice(-3)}`;
      }
      finalUsername = candidate;
    } else {
      const existingUsername = await findUserByUsername(finalUsername);
      if (existingUsername) {
        return res.status(400).json({
          status: 'error',
          field: 'username',
          message: 'El nombre de usuario ya está registrado.'
        });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const finalRol = rol ? rol.toUpperCase() : 'MINORISTA';
    const finalCountryCode = country_code || '+52';

    const userId = await createUser({
      nombre,
      apellido,
      email,
      username: finalUsername,
      country_code: finalCountryCode,
      whatsapp,
      negocio_url: negocio_url || null,
      password_hash,
      rol: finalRol
    });

    await addAccessLog({
      user_id: userId,
      ip_address: clientIp,
      user_agent: req.headers['user-agent'] || null,
      endpoint: '/api/auth/register',
      ip_raw: ipInfo
    });

    const token = generateToken({
      id: userId,
      email,
      rol: finalRol
    });

    return res.status(201).json({
      status: 'ok',
      message: 'Usuario registrado correctamente.',
      token,
      user: {
        id: userId,
        nombre,
        apellido,
        email,
        username: finalUsername,
        country_code: finalCountryCode,
        whatsapp,
        negocio_url: negocio_url || null,
        rol: finalRol
      }
    });
  } catch (error) {
    console.error('Error en register:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al registrar usuario.',
      error: error.message || 'sin mensaje'
    });
  }
}

// ========================
// LOGIN
// ========================
async function login(req, res) {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar email/usuario y contraseña.'
      });
    }

    let user = await findUserByEmail(emailOrUsername);
    if (!user) {
      user = await findUserByUsername(emailOrUsername);
    }

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Usuario o contraseña incorrectos.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'Usuario o contraseña incorrectos.'
      });
    }

    const clientIp = getClientIp(req);

    let ipInfo = null;
    try {
      ipInfo = await getIpInfo(clientIp);
    } catch (err) {
      ipInfo = null;
    }

    if (isSuspiciousIp(ipInfo)) {
      return res.status(403).json({
        status: 'error',
        message: 'Acceso denegado: no se permiten conexiones desde VPN, proxy o TOR.',
        ip: clientIp
      });
    }

    const isGlobalWhite = await isIpWhitelisted(clientIp);
    const isUserWhite = await isIpWhitelistedForUser(user.id, clientIp);

    if (!isGlobalWhite && !isUserWhite) {
      const lastAccessDiffUser = await getLastAccessByIpAndDifferentUser(clientIp, user.id);
      if (lastAccessDiffUser) {
        return res.status(403).json({
          status: 'error',
          message: 'Acceso denegado: esta dirección IP ya está registrada para otro usuario. Contacta al administrador.',
          ip: clientIp
        });
      }
    }

    const token = generateToken(user);

    await addAccessLog({
      user_id: user.id,
      ip_address: clientIp,
      user_agent: req.headers['user-agent'] || null,
      endpoint: '/api/auth/login',
      ip_raw: ipInfo
    });

    return res.json({
      status: 'ok',
      message: 'Login correcto.',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        username: user.username,
        country_code: user.country_code || '+52',
        whatsapp: user.whatsapp,
        negocio_url: user.negocio_url,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al iniciar sesión.',
      error: error.message || 'sin mensaje'
    });
  }
}

// ========================
// RECUPERAR CONTRASEÑA (1) - solicitar
// ========================
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar un correo electrónico.'
      });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // por seguridad respondemos ok aunque no exista
      return res.json({
        status: 'ok',
        message: 'Si el correo existe, se envió un enlace de recuperación.'
      });
    }

    // generar token seguro
    const token = crypto.randomBytes(32).toString('hex');
    // expira en 1 hora
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await createPasswordResetToken(user.id, token, expiresAt);

    // armar link
    const base = process.env.FRONTEND_BASE_URL || 'https://api-envios-dhl-production.up.railway.app/reset-password';
    const resetLink = `${base}?token=${token}`;

    await sendPasswordResetEmail(user.email, resetLink);

    return res.json({
      status: 'ok',
      message: 'Si el correo existe, se envió un enlace de recuperación.'
    });
  } catch (error) {
    console.error('Error en forgotPassword:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo procesar la solicitud.',
      error: error.message || 'sin mensaje'
    });
  }
}

// ========================
// RECUPERAR CONTRASEÑA (2) - reset
// ========================
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar token y nueva contraseña.'
      });
    }

    const tokenRow = await findValidToken(token);
    if (!tokenRow) {
      return res.status(400).json({
        status: 'error',
        message: 'Token inválido o expirado.'
      });
    }

    // actualizar contraseña del usuario
    const userId = tokenRow.user_id;

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);

    // actualizar en DB
    const { pool } = require('../config/db');
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [password_hash, userId]
    );

    // marcar token como usado
    await markTokenAsUsed(tokenRow.id);

    return res.json({
      status: 'ok',
      message: 'La contraseña se actualizó correctamente.'
    });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo restablecer la contraseña.',
      error: error.message || 'sin mensaje'
    });
  }
}

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword
};

// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/authController.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
  isIpWhitelisted
} = require('../models/ipWhitelistModel');

const { getIpInfo, isSuspiciousIp } = require('../services/ipService');

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
      country_code, // opcional
      whatsapp,
      negocio_url,
      password,
      rol
    } = req.body;

    // 1. Campos obligatorios
    if (!nombre || !apellido || !email || !whatsapp || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Faltan campos obligatorios.'
      });
    }

    // 2. Validar teléfono EXACTAMENTE 10 dígitos
    // (sin +52, sin espacios, sin guiones)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(whatsapp)) {
      return res.status(400).json({
        status: 'error',
        field: 'whatsapp',
        message: 'El teléfono debe tener exactamente 10 dígitos numéricos (sin +52, sin espacios, sin guiones).'
      });
    }

    // 3. Email único
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({
        status: 'error',
        field: 'email',
        message: 'El correo ya está registrado.'
      });
    }

    // 4. Username único (si lo mandan)
    if (username) {
      const existingUsername = await findUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({
          status: 'error',
          field: 'username',
          message: 'El nombre de usuario ya está registrado.'
        });
      }
    }

    // 5. Teléfono único
    const existingPhone = await findUserByWhatsapp(whatsapp);
    if (existingPhone) {
      return res.status(400).json({
        status: 'error',
        field: 'whatsapp',
        message: 'Este teléfono ya está registrado en otra cuenta.'
      });
    }

    // 6. IP del cliente
    const clientIp = getClientIp(req);

    // 7. ipregistry
    let ipInfo = null;
    try {
      ipInfo = await getIpInfo(clientIp);
    } catch (err) {
      // si ipregistry falla no rompemos, pero seguimos
      ipInfo = null;
    }

    // 8. Bloquear VPN / Proxy / TOR
    if (isSuspiciousIp(ipInfo)) {
      return res.status(403).json({
        status: 'error',
        message: 'Acceso denegado: no se permiten conexiones desde VPN, proxy o TOR.',
        ip: clientIp
      });
    }

    // 9. Validar IP repetida (tu regla)
    const isWhite = await isIpWhitelisted(clientIp);
    if (!isWhite) {
      const lastAccessDiffUser = await getLastAccessByIpAndDifferentUser(clientIp, null);
      if (lastAccessDiffUser) {
        return res.status(403).json({
          status: 'error',
          message: 'Acceso denegado: esta dirección IP ya está registrada para otro usuario. Contacta al administrador.',
          ip: clientIp
        });
      }
    }

    // 10. Hashear pass
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 11. Rol
    const finalRol = rol ? rol.toUpperCase() : 'MINORISTA';

    // 12. Country code por defecto
    const finalCountryCode = country_code || '+52';

    // 13. Crear usuario
    const userId = await createUser({
      nombre,
      apellido,
      email,
      username: username || null,
      country_code: finalCountryCode,
      whatsapp,
      negocio_url: negocio_url || null,
      password_hash,
      rol: finalRol
    });

    // 14. Log
    await addAccessLog({
      user_id: userId,
      ip_address: clientIp,
      user_agent: req.headers['user-agent'] || null,
      endpoint: '/api/auth/register',
      ip_raw: ipInfo
    });

    // 15. Token
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
        username: username || null,
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
// LOGIN (también bloquea VPN)
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

    // buscar por email o username
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

    // IP
    const clientIp = getClientIp(req);

    // ipregistry
    let ipInfo = null;
    try {
      ipInfo = await getIpInfo(clientIp);
    } catch (err) {
      ipInfo = null;
    }

    // bloquear VPN / proxy / tor en login también
    if (isSuspiciousIp(ipInfo)) {
      return res.status(403).json({
        status: 'error',
        message: 'Acceso denegado: no se permiten conexiones desde VPN, proxy o TOR.',
        ip: clientIp
      });
    }

    // validar IP vs otros usuarios
    const isWhite = await isIpWhitelisted(clientIp);
    if (!isWhite) {
      const lastAccessDiffUser = await getLastAccessByIpAndDifferentUser(clientIp, user.id);
      if (lastAccessDiffUser) {
        return res.status(403).json({
          status: 'error',
          message: 'Acceso denegado: esta dirección IP ya está registrada para otro usuario. Contacta al administrador.',
          ip: clientIp
        });
      }
    }

    // token
    const token = generateToken(user);

    // log
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

module.exports = {
  register,
  login
};

// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/authController.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  createUser,
  findUserByEmail,
  findUserByUsername
} = require('../models/userModel');

const {
  addAccessLog,
  getLastAccessByIpAndDifferentUser
} = require('../models/accessLogModel');

const {
  isIpWhitelisted
} = require('../models/ipWhitelistModel');

const { getIpInfo } = require('../services/ipService');

// función auxiliar para obtener la IP real del request
function getClientIp(req) {
  // 1) si viene de un proxy (Railway, Nginx, etc.)
  const xfwd = req.headers['x-forwarded-for'];
  if (xfwd) {
    // puede venir "ip1, ip2, ip3"
    return xfwd.split(',')[0].trim();
  }
  // 2) si viene de express
  if (req.ip) {
    return req.ip;
  }
  // 3) si viene de la conexión directa
  return req.connection?.remoteAddress || '0.0.0.0';
}

// función para generar JWT
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    rol: user.rol
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '8h'
  });
}

// ===========================
// POST /api/auth/register
// ===========================
async function register(req, res) {
  try {
    const {
      nombre,
      apellido,
      email,
      username,
      whatsapp,
      negocio_url,
      password,
      rol
    } = req.body;

    // 1. Validaciones básicas
    if (!nombre || !apellido || !email || !whatsapp || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Faltan campos obligatorios.'
      });
    }

    // 2. ¿ya existe el email?
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'El correo ya está registrado.'
      });
    }

    // 3. ¿ya existe el username? (solo si viene)
    if (username) {
      const existingUsername = await findUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({
          status: 'error',
          message: 'El nombre de usuario ya está registrado.'
        });
      }
    }

    // 4. obtener IP del cliente
    const clientIp = getClientIp(req);

    // 5. consultar ipregistry (puede fallar, lo manejamos suave)
    let ipInfo = null;
    try {
      ipInfo = await getIpInfo(clientIp);
    } catch (err) {
      // no rompemos el registro si ipregistry falla
      ipInfo = null;
    }

    // 6. validar si esta IP ya fue usada por OTRO usuario
    //    (nuestro modelo de logs tiene un helper para ver si la IP pertenece a otro user)
    const isWhite = await isIpWhitelisted(clientIp);

    if (!isWhite) {
      // si no está en whitelist, revisamos si la IP ya fue usada por alguien más
      const lastAccessDiffUser = await getLastAccessByIpAndDifferentUser(clientIp, null);
      if (lastAccessDiffUser) {
        return res.status(403).json({
          status: 'error',
          message: 'Acceso denegado: esta dirección IP ya está registrada para otro usuario. Contacta al administrador.',
          ip: clientIp
        });
      }
    }

    // 7. hashear password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 8. rol por defecto
    const finalRol = rol ? rol.toUpperCase() : 'MINORISTA';

    // 9. crear usuario
    const userId = await createUser({
      nombre,
      apellido,
      email,
      username: username || null,
      whatsapp,
      negocio_url: negocio_url || null,
      password_hash,
      rol: finalRol
    });

    // 10. registrar el acceso en logs
    await addAccessLog({
      user_id: userId,
      ip_address: clientIp,
      user_agent: req.headers['user-agent'] || null,
      endpoint: '/api/auth/register',
      ip_raw: ipInfo
    });

    // 11. generar token para que pueda usar de inmediato
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
        whatsapp,
        negocio_url: negocio_url || null,
        rol: finalRol
      }
    });
  } catch (error) {
    // 👇 AQUÍ el cambio que pediste
    console.error('Error en register:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al registrar usuario.',
      error: error.message || 'sin mensaje',
      // en producción puedes comentar la siguiente línea si no quieres mostrar stack
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
}

// ===========================
// POST /api/auth/login
// ===========================
async function login(req, res) {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar email/usuario y contraseña.'
      });
    }

    // buscar usuario por email o por username
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

    // comparar contraseña
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'Usuario o contraseña incorrectos.'
      });
    }

    // obtener IP
    const clientIp = getClientIp(req);

    // consultar ipregistry (otra vez, no rompemos si falla)
    let ipInfo = null;
    try {
      ipInfo = await getIpInfo(clientIp);
    } catch (err) {
      ipInfo = null;
    }

    // validar IP contra otros usuarios
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

    // generar token
    const token = generateToken(user);

    // registrar log
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
      error: error.message || 'sin mensaje',
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
}

module.exports = {
  register,
  login
};

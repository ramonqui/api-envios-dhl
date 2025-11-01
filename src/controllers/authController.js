const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  createUser,
  findUserByEmail,
  findUserByUsername
} = require('../models/userModel');
const { fetchIpInfo } = require('../services/ipService');
const { createAccessLog } = require('../models/accessLogModel');
const { validateIpUsage } = require('../services/ipRestrictionService');

const DEFAULT_ROLE = 'MINORISTA';

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || '0.0.0.0';
}

// =========================
// REGISTRO
// =========================
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

    if (!nombre || !apellido || !email || !whatsapp || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Faltan campos obligatorios (nombre, apellido, email, whatsapp, password).'
      });
    }

    const existingByEmail = await findUserByEmail(email);
    if (existingByEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'Ya existe un usuario con ese correo.'
      });
    }

    if (username) {
      const existingByUsername = await findUserByUsername(username);
      if (existingByUsername) {
        return res.status(400).json({
          status: 'error',
          message: 'El nombre de usuario ya está en uso.'
        });
      }
    }

    // 👇 IP del cliente
    const clientIp = getClientIp(req);

    // 🔐 Validar IP ANTES de crear usuario
    const ipCheck = await validateIpUsage(clientIp, null);
    if (!ipCheck.allowed) {
      return res.status(403).json({
        status: 'error',
        message: 'Acceso denegado: esta dirección IP ya está registrada para otro usuario. Contacta al administrador.',
        ip: clientIp,                        // 👈 mostramos la IP
        reason: ipCheck.reason || null       // 👈 opcional, útil para soporte
      });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const finalRole = rol ? rol.toUpperCase() : DEFAULT_ROLE;

    const userId = await createUser({
      nombre,
      apellido,
      email,
      username: username || null,
      whatsapp,
      negocio_url: negocio_url || null,
      password_hash,
      rol: finalRole
    });

    const userAgent = req.headers['user-agent'] || null;
    const ipregistryKey = process.env.IPREGISTRY_KEY;
    const ipInfo = await fetchIpInfo(clientIp, ipregistryKey);

    await createAccessLog({
      user_id: userId,
      ip_address: clientIp,
      user_agent: userAgent,
      country: ipInfo?.location?.country?.name || null,
      city: ipInfo?.location?.city || null,
      endpoint: '/api/auth/register',
      ip_raw: ipInfo
    });

    return res.status(201).json({
      status: 'ok',
      message: 'Usuario registrado correctamente.',
      data: {
        id: userId,
        nombre,
        apellido,
        email,
        username: username || null,
        whatsapp,
        negocio_url: negocio_url || null,
        rol: finalRole
      }
    });
  } catch (error) {
    console.error('Error en register:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al registrar usuario.',
      error: error.message
    });
  }
}

// =========================
// LOGIN
// =========================
async function login(req, res) {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar emailOrUsername y password.'
      });
    }

    let user = await findUserByEmail(emailOrUsername);
    if (!user) {
      user = await findUserByUsername(emailOrUsername);
    }

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Credenciales inválidas.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Credenciales inválidas.'
      });
    }

    const clientIp = getClientIp(req);

    // 🔐 Validar IP TAMBIÉN en el login
    const ipCheck = await validateIpUsage(clientIp, user.id);
    if (!ipCheck.allowed) {
      // Igual registramos el intento
      const ipregistryKey = process.env.IPREGISTRY_KEY;
      const ipInfo = await fetchIpInfo(clientIp, ipregistryKey);
      await createAccessLog({
        user_id: user.id,
        ip_address: clientIp,
        user_agent: req.headers['user-agent'] || null,
        country: ipInfo?.location?.country?.name || null,
        city: ipInfo?.location?.city || null,
        endpoint: '/api/auth/login (denied)',
        ip_raw: ipInfo
      });

      return res.status(403).json({
        status: 'error',
        message: 'Acceso denegado: esta dirección IP ya está registrada para otro usuario. Contacta al administrador.',
        ip: clientIp,                        // 👈 mostramos la IP
        reason: ipCheck.reason || null
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        rol: user.rol
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const ipregistryKey = process.env.IPREGISTRY_KEY;
    const ipInfo = await fetchIpInfo(clientIp, ipregistryKey);

    await createAccessLog({
      user_id: user.id,
      ip_address: clientIp,
      user_agent: req.headers['user-agent'] || null,
      country: ipInfo?.location?.country?.name || null,
      city: ipInfo?.location?.city || null,
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
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno en login.',
      error: error.message
    });
  }
}

module.exports = {
  register,
  login
};

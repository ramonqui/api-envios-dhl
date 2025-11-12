// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/adminController.js

const { getAccessLogs } = require('../models/accessLogModel');
const {
  getWhitelist,
  addIpToWhitelist,
  addIpToUserWhitelist,
  getUserWhitelist
} = require('../models/ipWhitelistModel');

const { sendTestEmail, brevoAccountPing, brevoConfigStatus } = require('../services/emailService');

/**
 * Logs de acceso
 */
async function listAccessLogs(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const logs = await getAccessLogs(limit);
    return res.json({ status: 'ok', count: logs.length, data: logs });
  } catch (error) {
    console.error('Error obteniendo logs:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudieron obtener los logs', error: error.message });
  }
}

/**
 * Whitelist global
 */
async function listWhitelist(req, res) {
  try {
    const ips = await getWhitelist();
    return res.json({ status: 'ok', count: ips.length, data: ips });
  } catch (error) {
    console.error('Error obteniendo whitelist:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudo obtener la whitelist', error: error.message });
  }
}

async function addToWhitelist(req, res) {
  try {
    const { ip_address, descripcion } = req.body;
    if (!ip_address) return res.status(400).json({ status: 'error', message: 'Debes enviar ip_address' });
    await addIpToWhitelist(ip_address, descripcion || null, 'admin-panel');
    return res.status(201).json({ status: 'ok', message: 'IP agregada a la whitelist global' });
  } catch (error) {
    console.error('Error agregando IP a whitelist:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudo agregar la IP a la whitelist', error: error.message });
  }
}

/**
 * Whitelist por usuario
 */
async function addUserIpWhitelist(req, res) {
  try {
    const { user_id, ip_address, descripcion } = req.body;
    if (!user_id || !ip_address) return res.status(400).json({ status: 'error', message: 'Debes enviar user_id e ip_address' });
    await addIpToUserWhitelist(user_id, ip_address, descripcion || null);
    return res.status(201).json({ status: 'ok', message: `IP ${ip_address} autorizada para el usuario ${user_id}` });
  } catch (error) {
    console.error('Error agregando IP a whitelist de usuario:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudo agregar la IP al usuario', error: error.message });
  }
}

async function listUserIpWhitelist(req, res) {
  try {
    const { userId } = req.params;
    const ips = await getUserWhitelist(userId);
    return res.json({ status: 'ok', user_id: userId, count: ips.length, data: ips });
  } catch (error) {
    console.error('Error obteniendo whitelist del usuario:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudo obtener la whitelist del usuario', error: error.message });
  }
}

/**
 * Brevo - ping de API (getAccount) para comprobar API Key
 */
async function brevoPing(req, res) {
  try {
    const result = await brevoAccountPing();
    return res.json({ status: 'ok', data: result });
  } catch (error) {
    console.error('[BREVO] ping error:', error);
    return res.status(500).json({ status: 'error', message: 'Brevo ping falló', error: String(error) });
  }
}

/**
 * Brevo - diagnóstico de configuración (sin exponer API Key completa)
 */
async function brevoConfig(req, res) {
  try {
    const cfg = brevoConfigStatus();
    return res.json({ status: 'ok', data: cfg });
  } catch (error) {
    console.error('[BREVO] config error:', error);
    return res.status(500).json({ status: 'error', message: 'Brevo config falló', error: String(error) });
  }
}

/**
 * Envío correo de prueba
 */
async function sendAdminTestEmail(req, res) {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ status: 'error', message: 'Debes enviar "to"' });
    const result = await sendTestEmail(to);
    return res.json({ status: result.sent ? 'ok' : 'error', result });
  } catch (error) {
    console.error('Error en sendAdminTestEmail:', error);
    return res.status(500).json({ status: 'error', message: 'Fallo al enviar correo de prueba', error: error.message });
  }
}

module.exports = {
  listAccessLogs,
  listWhitelist,
  addToWhitelist,
  addUserIpWhitelist,
  listUserIpWhitelist,
  sendAdminTestEmail,
  brevoPing,
  brevoConfig
};


// DEBUG: ver configuración de DHL sin credenciales sensibles
const { getDhlConfig } = require('../services/dhlService');

async function debugDhlConfig(req, res) {
  try {
    if ((req.headers['x-admin-key'] || '') !== (process.env.ADMIN_KEY || '')) {
      return res.status(403).json({ status: 'error', message: 'No autorizado' });
    }
    const cfg = getDhlConfig();
    return res.json({
      status: 'ok',
      dhl: {
        mode: cfg.mode,
        baseUrl: cfg.baseUrl,
        accountNumber: cfg.accountNumber,
        version: cfg.version,
      }
    });
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message });
  }
}

module.exports = {
  // ...exporta los demás handlers que ya tenías
  debugDhlConfig,
};

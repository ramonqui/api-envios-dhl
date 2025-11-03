// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/adminController.js

let getAccessLogs;
let getWhitelist, addIpToWhitelist, isIpWhitelisted, isIpWhitelistedForUser, addIpToUserWhitelist, getUserWhitelist;

try {
  ({ getAccessLogs } = require('../models/accessLogModel'));
} catch (err) {
  console.error('[BOOT] accessLogModel no disponible:', err?.message || err);
}

try {
  ({
    getWhitelist,
    addIpToWhitelist,
    isIpWhitelisted,
    isIpWhitelistedForUser,
    addIpToUserWhitelist,
    getUserWhitelist
  } = require('../models/ipWhitelistModel'));
} catch (err) {
  console.error('[BOOT] ipWhitelistModel no disponible:', err?.message || err);
}

let sendTestEmail;
try {
  ({ sendTestEmail } = require('../services/emailService'));
} catch (err) {
  console.error('[BOOT] emailService no disponible:', err?.message || err);
  sendTestEmail = async () => ({ sent: false, reason: 'emailService_unavailable' });
}

async function listAccessLogs(req, res) {
  try {
    if (!getAccessLogs) throw new Error('getAccessLogs no disponible');
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const logs = await getAccessLogs(limit);
    return res.json({ status: 'ok', count: logs.length, data: logs });
  } catch (error) {
    console.error('Error obteniendo logs:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudieron obtener los logs', error: error.message });
  }
}

async function listWhitelist(req, res) {
  try {
    if (!getWhitelist) throw new Error('getWhitelist no disponible');
    const ips = await getWhitelist();
    return res.json({ status: 'ok', count: ips.length, data: ips });
  } catch (error) {
    console.error('Error obteniendo whitelist:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudo obtener la whitelist', error: error.message });
  }
}

async function addToWhitelist(req, res) {
  try {
    if (!addIpToWhitelist) throw new Error('addIpToWhitelist no disponible');
    const { ip_address, descripcion } = req.body;
    if (!ip_address) return res.status(400).json({ status: 'error', message: 'Debes enviar ip_address' });
    await addIpToWhitelist(ip_address, descripcion || null, 'admin-panel');
    return res.status(201).json({ status: 'ok', message: 'IP agregada a la whitelist global' });
  } catch (error) {
    console.error('Error agregando IP a whitelist:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudo agregar la IP a la whitelist', error: error.message });
  }
}

async function addUserIpWhitelist(req, res) {
  try {
    if (!addIpToUserWhitelist) throw new Error('addIpToUserWhitelist no disponible');
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
    if (!getUserWhitelist) throw new Error('getUserWhitelist no disponible');
    const { userId } = req.params;
    const ips = await getUserWhitelist(userId);
    return res.json({ status: 'ok', user_id: userId, count: ips.length, data: ips });
  } catch (error) {
    console.error('Error obteniendo whitelist del usuario:', error);
    return res.status(500).json({ status: 'error', message: 'No se pudo obtener la whitelist del usuario', error: error.message });
  }
}

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
  sendAdminTestEmail
};

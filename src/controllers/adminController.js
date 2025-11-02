// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/adminController.js

const { getAccessLogs } = require('../models/accessLogModel');
const {
  getWhitelistedIps,
  addIpToWhitelist
} = require('../models/ipWhitelistModel');

/**
 * GET /api/admin/logs
 * Lista los últimos accesos (registros/logins)
 */
async function listAccessLogs(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const logs = await getAccessLogs(limit);

    return res.json({
      status: 'ok',
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('Error obteniendo logs:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudieron obtener los logs',
      error: error.message
    });
  }
}

/**
 * GET /api/admin/whitelist
 * Lista las IPs autorizadas
 */
async function listWhitelist(req, res) {
  try {
    const ips = await getWhitelistedIps();
    return res.json({
      status: 'ok',
      count: ips.length,
      data: ips
    });
  } catch (error) {
    console.error('Error obteniendo whitelist:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo obtener la whitelist',
      error: error.message
    });
  }
}

/**
 * POST /api/admin/whitelist
 * Body: { ip_address, descripcion }
 */
async function addToWhitelist(req, res) {
  try {
    const { ip_address, descripcion } = req.body;

    if (!ip_address) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar ip_address'
      });
    }

    await addIpToWhitelist(ip_address, descripcion || null, 'admin-panel');

    return res.status(201).json({
      status: 'ok',
      message: 'IP agregada a la whitelist'
    });
  } catch (error) {
    console.error('Error agregando IP a whitelist:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo agregar la IP a la whitelist',
      error: error.message
    });
  }
}

/**
 * POST /api/admin/whitelist/from-log/:ip
 * Permite autorizar rápido una IP que vimos en los logs
 */
async function addFromLog(req, res) {
  try {
    const { ip } = req.params;

    if (!ip) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar la IP'
      });
    }

    await addIpToWhitelist(ip, 'autorizada desde logs', 'admin-panel');

    return res.json({
      status: 'ok',
      message: `IP ${ip} agregada a la whitelist`
    });
  } catch (error) {
    console.error('Error agregando IP desde logs:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo agregar la IP desde logs',
      error: error.message
    });
  }
}

module.exports = {
  listAccessLogs,
  listWhitelist,
  addToWhitelist,
  addFromLog
};

const { getAccessLogs } = require('../models/accessLogModel');
const {
  getWhitelistedIps,
  addIpToWhitelist,
  isIpWhitelisted
} = require('../models/ipWhitelistModel');

// GET /api/admin/logs
async function listAccessLogs(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const logs = await getAccessLogs(limit);

    // enriquecemos cada log con si la IP está o no en whitelist
    const enriched = await Promise.all(
      logs.map(async (log) => {
        const whitelisted = log.ip_address
          ? await isIpWhitelisted(log.ip_address)
          : false;
        return {
          ...log,
          is_whitelisted: whitelisted
        };
      })
    );

    return res.json({
      status: 'ok',
      count: enriched.length,
      data: enriched
    });
  } catch (error) {
    console.error('Error listando access_logs:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudieron obtener los logs',
      error: error.message
    });
  }
}

// GET /api/admin/whitelist
async function listWhitelist(req, res) {
  try {
    const ips = await getWhitelistedIps();
    return res.json({
      status: 'ok',
      count: ips.length,
      data: ips
    });
  } catch (error) {
    console.error('Error listando whitelist:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo obtener la whitelist',
      error: error.message
    });
  }
}

// POST /api/admin/whitelist
async function addToWhitelist(req, res) {
  try {
    const { ip_address, descripcion } = req.body;

    if (!ip_address) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar ip_address'
      });
    }

    await addIpToWhitelist(ip_address, descripcion || null, 'admin-key');

    return res.status(201).json({
      status: 'ok',
      message: `IP ${ip_address} agregada a la whitelist.`
    });
  } catch (error) {
    console.error('Error agregando a whitelist:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo agregar a la whitelist',
      error: error.message
    });
  }
}

// POST /api/admin/whitelist/from-log/:ip
async function addToWhitelistFromLog(req, res) {
  try {
    const { ip } = req.params;

    if (!ip) {
      return res.status(400).json({
        status: 'error',
        message: 'Debes enviar la IP en la ruta.'
      });
    }

    // opcional: normalizar IPs raras
    const cleanedIp = ip.trim();

    await addIpToWhitelist(cleanedIp, 'autorizada desde logs', 'admin-key');

    return res.status(201).json({
      status: 'ok',
      message: `IP ${cleanedIp} agregada a la whitelist desde logs.`
    });
  } catch (error) {
    console.error('Error agregando a whitelist desde logs:', error);
    return res.status(500).json({
      status: 'error',
      message: 'No se pudo agregar la IP a la whitelist',
      error: error.message
    });
  }
}

module.exports = {
  listAccessLogs,
  listWhitelist,
  addToWhitelist,
  addToWhitelistFromLog
};

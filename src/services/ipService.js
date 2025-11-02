// /Users/macbookpro/proyectos/dhl-guias-api/src/services/ipService.js
const axios = require('axios');

const IPREGISTRY_KEY = process.env.IPREGISTRY_KEY;

/**
 * Obtiene información de una IP desde ipregistry
 */
async function getIpInfo(ip) {
  if (!IPREGISTRY_KEY) {
    return null;
  }

  const url = `https://api.ipregistry.co/${ip}?key=${IPREGISTRY_KEY}`;

  const { data } = await axios.get(url, {
    timeout: 4000
  });

  return data;
}

/**
 * Determina si la IP es sospechosa (proxy, VPN, TOR, anónima)
 */
function isSuspiciousIp(ipInfo) {
  if (!ipInfo) return false;

  const sec = ipInfo.security || {};

  // ipregistry suele traer estos campos:
  // is_vpn, is_proxy, is_tor, is_anonymous
  if (sec.is_vpn) return true;
  if (sec.is_proxy) return true;
  if (sec.is_tor) return true;
  if (sec.is_anonymous) return true;

  // algunos planes traen "threat" u otros
  return false;
}

module.exports = {
  getIpInfo,
  isSuspiciousIp
};

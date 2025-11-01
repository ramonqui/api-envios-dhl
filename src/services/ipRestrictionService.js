const { isIpWhitelisted } = require('../models/ipWhitelistModel');
const { getDistinctUsersByIp } = require('../models/accessLogModel');

/**
 * Regla:
 * - Si la IP está en whitelist -> permitir
 * - Si NO hay registros previos de esa IP -> permitir
 * - Si hay registros y NO hay user actual (registro nuevo) -> BLOQUEAR
 * - Si hay registros y el único user_id es el mismo que está logueando -> permitir
 * - Si hay registros y hay OTRO user_id distinto -> BLOQUEAR
 */
async function validateIpUsage(ip, currentUserId = null) {
  // 1. Whitelist manda
  const whitelisted = await isIpWhitelisted(ip);
  if (whitelisted) {
    return { allowed: true, reason: 'ip whitelisted' };
  }

  // 2. Buscar quién ha usado esta IP
  const userIds = await getDistinctUsersByIp(ip);

  // 2.1 Nunca se usó -> ok
  if (!userIds || userIds.length === 0) {
    return { allowed: true, reason: 'ip never used' };
  }

  // 2.2 Estamos en REGISTRO (no hay user aún) y ya hay usuarios con esa IP -> bloquear
  if (!currentUserId) {
    return {
      allowed: false,
      reason: 'ip already used by other users'
    };
  }

  // 2.3 Estamos en LOGIN y la IP solo la ha usado este mismo user -> ok
  if (userIds.length === 1 && userIds[0] === currentUserId) {
    return { allowed: true, reason: 'ip used by same user' };
  }

  // 2.4 Hay otros usuarios con esa IP -> bloquear
  if (userIds.length >= 1 && !userIds.includes(currentUserId)) {
    return {
      allowed: false,
      reason: 'ip already used by another user'
    };
  }

  // Por si acaso
  return { allowed: true, reason: 'default allow' };
}

module.exports = {
  validateIpUsage
};

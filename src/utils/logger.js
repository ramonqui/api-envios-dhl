// /Users/macbookpro/proyectos/dhl-guias-api/src/utils/logger.js

/**
 * Serialización segura para logs (evita "Converting circular structure to JSON").
 */
function safe(obj) {
  try {
    if (obj instanceof Error) {
      return JSON.stringify(
        {
          name: obj.name,
          message: obj.message,
          stack: obj.stack,
          cause: obj.cause,
        },
        null,
        2
      );
    }
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

/**
 * Prefijo por nivel
 */
function withLevel(level, msg, obj) {
  const time = new Date().toISOString();
  if (obj !== undefined) {
    console.log(
      safe({
        timestamp: time,
        level,
        message: msg,
        details: obj,
      })
    );
  } else {
    console.log(
      safe({
        timestamp: time,
        level,
        message: msg,
      })
    );
  }
}

module.exports = {
  info: (msg, obj) => withLevel('info', msg, obj),
  warn: (msg, obj) => withLevel('warn', msg, obj),
  error: (msg, obj) => withLevel('error', msg, obj),
  safe,
};

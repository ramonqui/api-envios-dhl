// /Users/macbookpro/proyectos/dhl-guias-api/src/server.js

require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

const app = require('./app');

// Cargar DB sin bloquear el arranque (solo loguea si falla)
(async () => {
  try {
    const { pool } = require('./config/db');
    pool.getConnection()
      .then(conn => {
        console.log('[DB] Conexión establecida');
        conn.release();
      })
      .catch(err => {
        console.error('[DB] No se pudo conectar al inicio (seguimos levantando):', err?.message || err);
      });
  } catch (err) {
    console.error('[DB] Error cargando módulo DB (seguimos levantando):', err?.message || err);
  }
})();

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[BOOT] API DHL-Guías escuchando en puerto ${PORT}`);
  console.log(`[BOOT] Healthcheck en /api/health - ${new Date().toISOString()}`);
});

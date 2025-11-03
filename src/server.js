// /Users/macbookpro/proyectos/dhl-guias-api/src/server.js

require('dotenv').config();
const app = require('./app');

// Asegura que el módulo de DB se cargue y valide conexión si aplica
require('./config/db');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API DHL-Guías escuchando en puerto ${PORT}`);
});

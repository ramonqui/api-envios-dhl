const app = require('./app');
const dotenv = require('dotenv');
const { testConnection } = require('./config/db');

dotenv.config();

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`🚀 Servidor DHL guías escuchando en http://localhost:${PORT}`);
  // probamos la conexión a la BD al iniciar
  await testConnection();
});

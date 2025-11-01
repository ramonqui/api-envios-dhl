const dotenv = require('dotenv');
dotenv.config();

function adminKeyMiddleware(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  const clientKey = req.headers['x-admin-key'];

  if (!adminKey) {
    return res.status(500).json({
      status: 'error',
      message: 'ADMIN_API_KEY no está configurada en el servidor.'
    });
  }

  if (!clientKey) {
    return res.status(401).json({
      status: 'error',
      message: 'Falta la cabecera x-admin-key.'
    });
  }

  if (clientKey !== adminKey) {
    return res.status(403).json({
      status: 'error',
      message: 'No tienes permisos para ver estos registros.'
    });
  }

  // todo bien
  next();
}

module.exports = adminKeyMiddleware;

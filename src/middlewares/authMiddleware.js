const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      status: 'error',
      message: 'No se encontró el encabezado de autorización.'
    });
    }

  // Esperamos formato: Bearer token
  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return res.status(401).json({
      status: 'error',
      message: 'Formato de autorización inválido.'
    });
  }

  const scheme = parts[0];
  const token = parts[1];

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({
      status: 'error',
      message: 'Tipo de token inválido.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // aquí vienen: id, email, rol
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Token inválido o expirado.',
      error: error.message
    });
  }
}

module.exports = authMiddleware;

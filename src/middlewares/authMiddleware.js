// /Users/macbookpro/proyectos/dhl-guias-api/src/middlewares/authMiddleware.js

const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación con JWT.
 *
 * Espera un header:
 *   Authorization: Bearer <token>
 *
 * Si el token es válido, agrega:
 *   req.user = { id, email, rol, ... }
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        status: 'error',
        message: 'No autorizado. Falta token Bearer.'
      });
    }

    const token = parts[1];

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        status: 'error',
        message: 'Falta configurar JWT_SECRET en el servidor.'
      });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err || !decoded) {
        return res.status(401).json({
          status: 'error',
          message: 'Token inválido o expirado.'
        });
      }

      // decoded debería tener { id, email, rol, iat, exp }
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error('Error en authMiddleware:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno en autenticación.',
      error: error.message || 'sin mensaje'
    });
  }
}

module.exports = {
  authMiddleware
};

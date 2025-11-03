// /Users/macbookpro/proyectos/dhl-guias-api/src/middlewares/adminKeyMiddleware.js

module.exports = function adminKeyMiddleware(req, res, next) {
  const headerKey = req.headers['x-admin-key'];
  const adminKey = process.env.ADMIN_KEY || 'super_admin_key_123';

  if (!headerKey || headerKey !== adminKey) {
    return res.status(401).json({
      status: 'error',
      message: 'No autorizado. Falta o es inválida la x-admin-key.'
    });
  }

  next();
};

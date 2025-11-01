function roleMiddleware(allowedRoles = []) {
  return (req, res, next) => {
    // aquí asumimos que authMiddleware ya corrió
    if (!req.user || !req.user.rol) {
      return res.status(403).json({
        status: 'error',
        message: 'No hay información de rol en el token.'
      });
    }

    const userRole = req.user.rol.toUpperCase();

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        status: 'error',
        message: 'No tienes permisos para acceder a este recurso.',
        yourRole: userRole
      });
    }

    return next();
  };
}

module.exports = roleMiddleware;

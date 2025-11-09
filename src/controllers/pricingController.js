// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/pricingController.js

/**
 * Controlador para cotizaciones de precios.
 *
 * Endpoint principal:
 *   POST /api/pricing/quote
 *
 * Requiere:
 *   - Header: Authorization: Bearer <token JWT>
 *   - Body JSON:
 *       {
 *         "originPostalCode": "50110",
 *         "originCityName": "Toluca",
 *         "destinationPostalCode": "92800",
 *         "destinationCityName": "Tuxpan",
 *         "weight": 1,
 *         "length": 10,
 *         "width": 10,
 *         "height": 10,
 *         "plannedShippingDate": "2025-11-08"  // opcional
 *       }
 */

const jwt = require('jsonwebtoken');
const { quoteForUser } = require('../services/pricingService');

/**
 * Extrae el usuario a partir del JWT enviado en Authorization: Bearer <token>
 */
function getUserFromRequest(req) {
  const authHeader = req.headers['authorization'] || '';
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return { error: 'Falta header Authorization Bearer.' };
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded debería tener { id, email, rol, iat, exp }
    return { user: { id: decoded.id, email: decoded.email, rol: decoded.rol } };
  } catch (err) {
    return { error: 'Token inválido o expirado.' };
  }
}

/**
 * Valida que el body tenga los campos mínimos necesarios.
 */
function validateQuoteBody(body) {
  const requiredFields = [
    'originPostalCode',
    'originCityName',
    'destinationPostalCode',
    'destinationCityName',
    'weight',
    'length',
    'width',
    'height'
  ];

  const missing = requiredFields.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === ''
  );

  if (missing.length > 0) {
    return `Faltan campos obligatorios: ${missing.join(', ')}`;
  }

  return null;
}

/**
 * POST /api/pricing/quote
 */
async function quoteShipment(req, res) {
  try {
    // 1) Autenticación por JWT
    const { user, error: userError } = getUserFromRequest(req);
    if (userError) {
      return res.status(401).json({ status: 'error', message: userError });
    }

    // 2) Validación básica del body
    const validationError = validateQuoteBody(req.body || {});
    if (validationError) {
      return res.status(400).json({ status: 'error', message: validationError });
    }

    const {
      originPostalCode,
      originCityName,
      destinationPostalCode,
      destinationCityName,
      weight,
      length,
      width,
      height,
      plannedShippingDate
    } = req.body;

    const shipmentParams = {
      originPostalCode,
      originCityName,
      destinationPostalCode,
      destinationCityName,
      weight,
      length,
      width,
      height,
      plannedShippingDate
    };

    // 3) Lógica de negocio en el servicio
    const result = await quoteForUser(user, shipmentParams);

    if (result.status === 'error') {
      // Si viene con tipo de error específico, mapeamos el HTTP status
      let httpStatus = 400;
      if (result.type === 'DHL_ERROR') httpStatus = 502; // error externo
      if (result.type === 'INVALID_WEIGHT') httpStatus = 400;
      if (result.type === 'NO_PRICING_RULE') httpStatus = 409;
      if (result.type === 'NO_CREDITS') httpStatus = 409;

      return res.status(httpStatus).json(result);
    }

    // 4) Respuesta OK
    return res.json(result);
  } catch (err) {
    console.error('Error en quoteShipment:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al obtener la cotización.',
      error: err.message || 'sin mensaje'
    });
  }
}

module.exports = {
  quoteShipment
};

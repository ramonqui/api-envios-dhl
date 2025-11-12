// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/pricingController.js

/**
 * Controlador de cotización de envíos.
 *
 * - Valida datos básicos del envío
 * - Valida códigos postales (formato y existencia) con api-codigos-postales-mx
 * - Obtiene municipio/estado/ciudad para origen y destino
 * - Llama al servicio de pricing (quoteForUser) que integra DHL + reglas internas
 * - Devuelve:
 *    * resultado de pricing
 *    * originLocation / destinationLocation con municipio y estado
 */

const { quoteForUser } = require('../services/pricingService');
const { lookupPostalCode } = require('../services/postalCodeService');

/**
 * POST /api/pricing/quote
 *
 * Body esperado:
 * {
 *   "originPostalCode": "50110",
 *   "originCityName": "Toluca",        // opcional, si no viene usamos ciudad/municipio del CP
 *   "destinationPostalCode": "92800",
 *   "destinationCityName": "Tuxpan",   // opcional
 *   "weight": 1,
 *   "length": 10,
 *   "width": 10,
 *   "height": 10,
 *   "plannedShippingDate": "2025-11-11" // opcional
 * }
 *
 * Requiere autenticación (JWT en Authorization: Bearer <token>).
 */
async function quoteShipment(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'No autorizado. Falta usuario autenticado.'
      });
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
    } = req.body || {};

    // =============================
    // Validaciones básicas de input
    // =============================

    if (
      !originPostalCode ||
      !destinationPostalCode ||
      weight == null ||
      length == null ||
      width == null ||
      height == null
    ) {
      return res.status(400).json({
        status: 'error',
        message:
          'Debes enviar originPostalCode, destinationPostalCode, weight, length, width y height.'
      });
    }

    const cpRegex = /^[0-9]{5}$/;

    if (!cpRegex.test(String(originPostalCode).trim())) {
      return res.status(400).json({
        status: 'error',
        field: 'originPostalCode',
        message: 'El código postal de origen debe tener exactamente 5 dígitos numéricos.'
      });
    }

    if (!cpRegex.test(String(destinationPostalCode).trim())) {
      return res.status(400).json({
        status: 'error',
        field: 'destinationPostalCode',
        message: 'El código postal de destino debe tener exactamente 5 dígitos numéricos.'
      });
    }

    const weightNum = Number(weight);
    if (isNaN(weightNum) || weightNum <= 0) {
      return res.status(400).json({
        status: 'error',
        field: 'weight',
        message: 'El peso debe ser un número mayor a 0.'
      });
    }

    const lengthNum = Number(length);
    const widthNum = Number(width);
    const heightNum = Number(height);

    if (isNaN(lengthNum) || lengthNum <= 0) {
      return res.status(400).json({
        status: 'error',
        field: 'length',
        message: 'El largo (length) debe ser un número mayor a 0.'
      });
    }

    if (isNaN(widthNum) || widthNum <= 0) {
      return res.status(400).json({
        status: 'error',
        field: 'width',
        message: 'El ancho (width) debe ser un número mayor a 0.'
      });
    }

    if (isNaN(heightNum) || heightNum <= 0) {
      return res.status(400).json({
        status: 'error',
        field: 'height',
        message: 'La altura (height) debe ser un número mayor a 0.'
      });
    }

    // ==========================================
    // Validar CP de origen con api-codigos-postales-mx
    // ==========================================
    const origenInfo = await lookupPostalCode(originPostalCode);

    if (!origenInfo.ok) {
      // Si el problema es sólo formato, ya lo habíamos validado antes,
      // aquí consideramos que no existe o hubo error con la API externa.
      return res.status(400).json({
        status: 'error',
        field: 'originPostalCode',
        message: origenInfo.message || 'No se pudo validar el código postal de origen.',
        error_code: origenInfo.error || null,
        cp: originPostalCode
      });
    }

    // ==========================================
    // Validar CP de destino con api-codigos-postales-mx
    // ==========================================
    const destinoInfo = await lookupPostalCode(destinationPostalCode);

    if (!destinoInfo.ok) {
      return res.status(400).json({
        status: 'error',
        field: 'destinationPostalCode',
        message: destinoInfo.message || 'No se pudo validar el código postal de destino.',
        error_code: destinoInfo.error || null,
        cp: destinationPostalCode
      });
    }

    // ==========================================
    // Construir parámetros para la cotización DHL
    // Si no viene cityName, usamos la ciudad o municipio
    // devueltos por la API de CP.
    // ==========================================

    const finalOriginCity =
      originCityName ||
      origenInfo.ciudad ||
      origenInfo.municipio ||
      null;

    const finalDestinationCity =
      destinationCityName ||
      destinoInfo.ciudad ||
      destinoInfo.municipio ||
      null;

    const shipmentParams = {
      originPostalCode: String(originPostalCode).trim(),
      originCityName: finalOriginCity,
      destinationPostalCode: String(destinationPostalCode).trim(),
      destinationCityName: finalDestinationCity,
      weight: weightNum,
      length: lengthNum,
      width: widthNum,
      height: heightNum,
      plannedShippingDate
    };

    // ==========================================
    // Llamar al servicio de pricing (DHL + reglas internas)
    // ==========================================

    const quoteResult = await quoteForUser(user, shipmentParams);

    if (!quoteResult || quoteResult.status !== 'ok') {
      // Podemos mapear tipos de error a códigos HTTP,
      // pero de momento respondemos 400 si es error "esperado"
      // y 500 si no trae tipo.
      const statusCode = quoteResult?.type ? 400 : 500;

      return res.status(statusCode).json({
        status: 'error',
        message:
          quoteResult?.message || 'No se pudo calcular la cotización.',
        type: quoteResult?.type || 'UNKNOWN',
        details: quoteResult
      });
    }

    // ==========================================
    // Respuesta final:
    //  - Todo lo que devuelve quoteForUser (pricing + DHL)
    //  - Más originLocation y destinationLocation con
    //    municipio / estado / ciudad (desde API CP)
    // ==========================================

    return res.json({
      ...quoteResult,
      originLocation: {
        cp: origenInfo.cp,
        municipio: origenInfo.municipio,
        estado: origenInfo.estado,
        ciudad: origenInfo.ciudad,
        zona: origenInfo.zona
      },
      destinationLocation: {
        cp: destinoInfo.cp,
        municipio: destinoInfo.municipio,
        estado: destinoInfo.estado,
        ciudad: destinoInfo.ciudad,
        zona: destinoInfo.zona
      }
    });
  } catch (error) {
    console.error('Error en quoteShipment:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error interno al procesar la cotización.',
      error: error.message || 'sin mensaje'
    });
  }
}

module.exports = {
  quoteShipment
};

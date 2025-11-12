// /Users/macbookpro/proyectos/dhl-guias-api/src/controllers/pricingController.js

/**
 * Controlador de cotización de envíos.
 *
 * Cambios clave:
 * - Redondeo hacia arriba (ceil) de weight, length, width, height.
 * - Cálculo de peso volumétrico: ceil((L * W * H) / 5000).
 * - Peso tarifario (shipmentWeightUsed) = max(weightCeil, volumetricWeight).
 * - plannedShippingDate por defecto = hoy (YYYY-MM-DD).
 * - originCityName/destinationCityName = municipio del CP validado.
 * - Agrega originState/destinationState + originLocation/destinationLocation en la respuesta.
 */

const { quoteForUser } = require('../services/pricingService');
const { lookupPostalCode } = require('../services/postalCodeService');

function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ceilNumber(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return Math.ceil(num);
}

async function quoteShipment(req, res) {
  try {
    // Requiere autenticación (ya lo protege el middleware)
    const user = req.user;
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'No autorizado.' });
    }

    const {
      originPostalCode,
      destinationPostalCode,
      originCityName,        // ignorado; lo sobreescribimos
      destinationCityName,   // ignorado; lo sobreescribimos
      weight,
      length,
      width,
      height,
      plannedShippingDate
    } = req.body || {};

    // Validaciones de presencia
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
        message: 'Debes enviar originPostalCode, destinationPostalCode, weight, length, width y height.'
      });
    }

    // Validación de CPs (5 dígitos)
    const cpRegex = /^[0-9]{5}$/;
    if (!cpRegex.test(String(originPostalCode).trim())) {
      return res.status(400).json({ status: 'error', field: 'originPostalCode', message: 'CP de origen inválido (5 dígitos).' });
    }
    if (!cpRegex.test(String(destinationPostalCode).trim())) {
      return res.status(400).json({ status: 'error', field: 'destinationPostalCode', message: 'CP de destino inválido (5 dígitos).' });
    }

    // Redondeo hacia arriba de dimensiones y peso (enteros)
    const weightCeil = ceilNumber(weight);
    const lengthCeil = ceilNumber(length);
    const widthCeil  = ceilNumber(width);
    const heightCeil = ceilNumber(height);

    if ([weightCeil, lengthCeil, widthCeil, heightCeil].some(v => v === null || v <= 0)) {
      return res.status(400).json({
        status: 'error',
        message: 'weight, length, width y height deben ser números > 0. Se redondean al entero superior.'
      });
    }

    // Validar CPs con nuestra API y extraer municipio/estado/ciudad
    const origenInfo = await lookupPostalCode(String(originPostalCode).trim());
    if (!origenInfo.ok) {
      return res.status(400).json({
        status: 'error',
        field: 'originPostalCode',
        message: origenInfo.message || 'No se pudo validar el CP de origen.'
      });
    }

    const destinoInfo = await lookupPostalCode(String(destinationPostalCode).trim());
    if (!destinoInfo.ok) {
      return res.status(400).json({
        status: 'error',
        field: 'destinationPostalCode',
        message: destinoInfo.message || 'No se pudo validar el CP de destino.'
      });
    }

    // Rellenar ciudades con MUNICIPIO del CP
    const finalOriginCity       = origenInfo.municipio || origenInfo.ciudad || null;
    const finalDestinationCity  = destinoInfo.municipio || destinoInfo.ciudad || null;

    // plannedShippingDate por defecto = hoy
    const finalPlannedDate = (plannedShippingDate && String(plannedShippingDate).trim() !== '')
      ? String(plannedShippingDate).trim()
      : getTodayDateString();

    // Peso volumétrico = ceil((L*W*H)/5000)
    const volumetricWeight = Math.ceil((lengthCeil * widthCeil * heightCeil) / 5000);
    // Peso tarifario (el que se usará para cotizar)
    const shipmentWeightUsed = Math.max(weightCeil, volumetricWeight);

    // Parámetros para la cotización (enviamos el peso tarifario)
    const shipmentParams = {
      originPostalCode: String(originPostalCode).trim(),
      originCityName: finalOriginCity,
      destinationPostalCode: String(destinationPostalCode).trim(),
      destinationCityName: finalDestinationCity,
      // ¡Ojo! DHL recibe ESTE peso:
      weight: shipmentWeightUsed,
      // Guardamos también los redondeados para referencia interna en el servicio
      weightRounded: weightCeil,
      lengthRounded: lengthCeil,
      widthRounded: widthCeil,
      heightRounded: heightCeil,
      volumetricWeight,
      shipmentWeightUsed,
      plannedShippingDate: finalPlannedDate
    };

    // Llamar al servicio de pricing (DHL + reglas internas + redondeo de precios)
    const quoteResult = await quoteForUser(user, shipmentParams);

    if (!quoteResult || quoteResult.status !== 'ok') {
      const statusCode = quoteResult?.type ? 400 : 500;
      return res.status(statusCode).json({
        status: 'error',
        message: quoteResult?.message || 'No se pudo calcular la cotización.',
        type: quoteResult?.type || 'UNKNOWN',
        details: quoteResult || null
      });
    }

    // Respuesta
    return res.json({
      ...quoteResult,

      // Exponemos también estos datos de cálculo:
      volumetricWeight,           // Peso volumétrico usado
      shipmentWeightUsed,         // Peso por el que se tarifica (mayor entre volumétrico y físico)
      inputRounded: {
        weight: weightCeil,
        length: lengthCeil,
        width:  widthCeil,
        height: heightCeil
      },

      // Estados en el nivel raíz (como pediste antes)
      originState: origenInfo.estado || null,
      destinationState: destinoInfo.estado || null,

      // Contexto de CPs:
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

module.exports = { quoteShipment };

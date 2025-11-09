// /Users/macbookpro/proyectos/dhl-guias-api/src/services/dhlService.js

/**
 * Servicio para consumir el API MyDHL de DHL Express.
 *
 * - Soporta modo TEST y PROD, controlado por la variable DHL_API_MODE.
 * - Usa Basic Auth (usuario/contraseña en variables de entorno).
 * - Envía los parámetros según lo proporcionado por el proyecto.
 *
 * Por ahora este servicio solo se usará para pruebas y devolverá
 * la respuesta cruda de DHL. Más adelante, sobre esta base,
 * implementaremos la lógica de:
 *   - costos base
 *   - zona extendida
 *   - manejo especial
 *   - integración con reglas de precios y créditos
 */

const axios = require('axios');

// Leemos configuración desde variables de entorno
const DHL_API_MODE = (process.env.DHL_API_MODE || 'TEST').toUpperCase(); // TEST o PROD
const DHL_API_TEST_BASE_URL =
  process.env.DHL_API_TEST_BASE_URL || 'https://express.api.dhl.com/mydhlapi/test';
const DHL_API_PROD_BASE_URL =
  process.env.DHL_API_PROD_BASE_URL || 'https://express.api.dhl.com/mydhlapi';

const DHL_API_USERNAME = process.env.DHL_API_USERNAME;
const DHL_API_PASSWORD = process.env.DHL_API_PASSWORD;
const DHL_API_ACCOUNT_NUMBER = process.env.DHL_API_ACCOUNT_NUMBER || '984196483';
const DHL_API_VERSION = process.env.DHL_API_VERSION || '3.1.0';

// País fijo MX
const DHL_ORIGIN_COUNTRY_CODE = 'MX';
const DHL_DESTINATION_COUNTRY_CODE = 'MX';

// Unidad fija métrica
const DHL_UNIT_OF_MEASUREMENT = 'metric';

/**
 * Obtiene la URL base según el modo (TEST o PROD).
 */
function getBaseUrl() {
  if (DHL_API_MODE === 'PROD') {
    return DHL_API_PROD_BASE_URL;
  }
  return DHL_API_TEST_BASE_URL;
}

/**
 * Valida que tengamos usuario/contraseña configurados.
 * Si falta algo, lanza un error claro.
 */
function validateConfig() {
  if (!DHL_API_USERNAME || !DHL_API_PASSWORD) {
    throw new Error(
      'Faltan credenciales de DHL. Revisa DHL_API_USERNAME y DHL_API_PASSWORD en tu .env'
    );
  }
}

/**
 * Arma el payload para la petición a DHL con base en los parámetros.
 *
 * params = {
 *   originPostalCode: string
 *   originCityName: string
 *   destinationPostalCode: string
 *   destinationCityName: string
 *   weight: number
 *   length: number
 *   width: number
 *   height: number
 *   plannedShippingDate: string (YYYY-MM-DD)
 *   isCustomsDeclarable?: boolean (por defecto false)
 *   unitOfMeasurement?: 'metric' | 'imperial' (por defecto metric)
 *   nextBusinessDay?: boolean (por defecto true)
 * }
 */
function buildDhlRequestBody(params) {
  const {
    originPostalCode,
    originCityName,
    destinationPostalCode,
    destinationCityName,
    weight,
    length,
    width,
    height,
    plannedShippingDate,
    isCustomsDeclarable = false,
    unitOfMeasurement = DHL_UNIT_OF_MEASUREMENT,
    nextBusinessDay = true
  } = params;

  return {
    accountNumber: DHL_API_ACCOUNT_NUMBER,
    originCountryCode: DHL_ORIGIN_COUNTRY_CODE,
    originPostalCode,
    originCityName,
    destinationCountryCode: DHL_DESTINATION_COUNTRY_CODE,
    destinationPostalCode,
    destinationCityName,
    weight,
    length,
    width,
    height,
    plannedShippingDate,
    isCustomsDeclarable,
    unitOfMeasurement,
    nextBusinessDay
  };
}

/**
 * Llama al API de DHL MyDHL con los parámetros especificados.
 *
 * - Hace POST a la URL base (modo TEST o PROD).
 * - Usa Basic Auth con usuario/contraseña configurados en .env.
 * - Envía header x-version con la versión de API.
 *
 * Devuelve un objeto:
 * {
 *   success: true/false,
 *   mode: 'TEST' | 'PROD',
 *   url: 'https://...',
 *   requestBody: {...},
 *   dhlResponse: {...} // respuesta completa de DHL (data)
 * }
 */
async function getDhlRateQuote(params) {
  validateConfig();

  const baseUrl = getBaseUrl();
  const url = baseUrl; // Por ahora la URL que nos diste es directa (sin /rates u otra ruta)

  const body = buildDhlRequestBody(params);

  try {
    console.log('[DHL] Enviando petición a:', url);
    console.log('[DHL] Modo:', DHL_API_MODE);
    console.log('[DHL] Body parcial:', {
      accountNumber: body.accountNumber,
      originPostalCode: body.originPostalCode,
      originCityName: body.originCityName,
      destinationPostalCode: body.destinationPostalCode,
      destinationCityName: body.destinationCityName,
      weight: body.weight
    });

    const response = await axios.post(url, body, {
      auth: {
        username: DHL_API_USERNAME,
        password: DHL_API_PASSWORD
      },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-version': DHL_API_VERSION
      },
      timeout: 15000 // 15 segundos por si la red va lenta
    });

    return {
      success: true,
      mode: DHL_API_MODE,
      url,
      requestBody: body,
      dhlResponse: response.data
    };
  } catch (error) {
    // Logueamos lo máximo posible sin exponer el password.
    const status = error.response?.status;
    const data = error.response?.data;

    console.error('[DHL] Error en la petición:');
    console.error('  Status:', status);
    console.error('  Data:', JSON.stringify(data, null, 2));

    return {
      success: false,
      mode: DHL_API_MODE,
      url,
      requestBody: body,
      error: {
        message: error.message,
        status,
        data
      }
    };
  }
}

module.exports = {
  getDhlRateQuote
};

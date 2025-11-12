// /Users/macbookpro/proyectos/dhl-guias-api/src/services/dhlService.js

/**
 * Servicio para construir URLs del API de DHL (GET /rates).
 * 
 * - Soporta modo TEST y PRODUCCIÓN.
 * - Usa autenticación Basic (username/password).
 * - Incluye header x-version.
 * - Todos los parámetros se envían por querystring (DHL no acepta body JSON).
 */

const axios = require('axios');
const qs = require('querystring');

/**
 * Construye la URL completa de cotización con todos los parámetros.
 * Ejemplo:
 * https://express.api.dhl.com/mydhlapi/test/rates?accountNumber=984196483&originCountryCode=MX...
 */
function buildDhlRatesUrl(params = {}, mode = 'TEST') {
  const baseUrl =
    mode === 'PROD'
      ? 'https://express.api.dhl.com/mydhlapi/rates'
      : 'https://express.api.dhl.com/mydhlapi/test/rates';

  // Serializamos los parámetros en querystring
  const query = qs.stringify(params);
  return `${baseUrl}?${query}`;
}

/**
 * Realiza una llamada directa a DHL y devuelve la respuesta JSON.
 * Usa autenticación Basic (desde .env).
 * 
 * @param {Object} params - Parámetros de envío (peso, CP, dimensiones, etc.)
 * @param {string} mode - 'TEST' o 'PROD'
 */
async function getDhlQuote(params, mode = 'TEST') {
  const url = buildDhlRatesUrl(params, mode);

  const auth = {
    username: process.env.DHL_API_USERNAME || 'apI7sO6nI6rH1q',
    password: process.env.DHL_API_PASSWORD || 'B@3oT!4wC^0hO!4z'
  };

  const headers = {
    'x-version': process.env.DHL_API_VERSION || '3.1.0'
  };

  try {
    const response = await axios.get(url, { auth, headers });
    return {
      status: 'ok',
      data: response.data,
      url
    };
  } catch (error) {
    console.error('[DHL API ERROR]', error.response?.data || error.message);
    return {
      status: 'error',
      message: 'Error al consultar DHL',
      error: error.response?.data || error.message,
      url
    };
  }
}

module.exports = {
  buildDhlRatesUrl,
  getDhlQuote
};

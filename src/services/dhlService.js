// /Users/macbookpro/proyectos/dhl-guias-api/src/services/dhlService.js

/**
 * Servicio MyDHL Express API con soporte para:
 * - Ambiente TEST y PROD con credenciales separadas.
 * - Selección automática según DHL_API_MODE en .env.
 */

const axios = require('axios');

// --- Variables desde .env ---
const DHL_API_MODE = (process.env.DHL_API_MODE || 'TEST').toUpperCase(); // TEST o PROD

// URLs
const DHL_API_TEST_BASE_URL = process.env.DHL_API_TEST_BASE_URL || 'https://express.api.dhl.com/mydhlapi/test';
const DHL_API_PROD_BASE_URL = process.env.DHL_API_PROD_BASE_URL || 'https://express.api.dhl.com/mydhlapi';

// Credenciales TEST
const DHL_API_TEST_USERNAME = process.env.DHL_API_TEST_USERNAME;
const DHL_API_TEST_PASSWORD = process.env.DHL_API_TEST_PASSWORD;
const DHL_API_TEST_ACCOUNT_NUMBER = process.env.DHL_API_TEST_ACCOUNT_NUMBER;

// Credenciales PROD
const DHL_API_PROD_USERNAME = process.env.DHL_API_PROD_USERNAME;
const DHL_API_PROD_PASSWORD = process.env.DHL_API_PROD_PASSWORD;
const DHL_API_PROD_ACCOUNT_NUMBER = process.env.DHL_API_PROD_ACCOUNT_NUMBER;

const DHL_API_VERSION = process.env.DHL_API_VERSION || '3.1.0';

// Valores fijos
const DHL_ORIGIN_COUNTRY_CODE = 'MX';
const DHL_DESTINATION_COUNTRY_CODE = 'MX';
const DHL_UNIT_OF_MEASUREMENT = 'metric';

/**
 * Devuelve la configuración correcta según el modo (TEST o PROD)
 */
function getEnvConfig() {
  if (DHL_API_MODE === 'PROD') {
    return {
      baseUrl: DHL_API_PROD_BASE_URL,
      username: DHL_API_PROD_USERNAME,
      password: DHL_API_PROD_PASSWORD,
      accountNumber: DHL_API_PROD_ACCOUNT_NUMBER
    };
  }
  return {
    baseUrl: DHL_API_TEST_BASE_URL,
    username: DHL_API_TEST_USERNAME,
    password: DHL_API_TEST_PASSWORD,
    accountNumber: DHL_API_TEST_ACCOUNT_NUMBER
  };
}

/**
 * Construye el cuerpo de la petición
 */
function buildRequestBody(params, accountNumber) {
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
    accountNumber,
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
 * Llama al endpoint de DHL (TEST o PROD según el .env)
 */
async function getDhlRateQuote(params) {
  const env = getEnvConfig();

  if (!env.username || !env.password) {
    throw new Error(
      `❌ Credenciales DHL no configuradas para modo ${DHL_API_MODE}. Verifica tu archivo .env`
    );
  }

  const body = buildRequestBody(params, env.accountNumber);

  try {
    console.log(`[DHL] 🔄 Enviando petición (${DHL_API_MODE}) a: ${env.baseUrl}`);

    const response = await axios.post(env.baseUrl, body, {
      auth: {
        username: env.username,
        password: env.password
      },
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-version': DHL_API_VERSION
      },
      timeout: 15000
    });

    return {
      success: true,
      mode: DHL_API_MODE,
      url: env.baseUrl,
      requestBody: body,
      dhlResponse: response.data
    };
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;

    console.error(`[DHL] ❌ Error (${DHL_API_MODE}):`, status);
    if (data) console.error(JSON.stringify(data, null, 2));

    return {
      success: false,
      mode: DHL_API_MODE,
      url: env.baseUrl,
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

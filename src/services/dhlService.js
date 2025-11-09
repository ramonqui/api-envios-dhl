// /Users/macbookpro/proyectos/dhl-guias-api/src/services/dhlService.js

/**
 * Servicio MyDHL Express API
 *
 * 👉 Endpoint de tarifas: /rates
 * 👉 DHL requiere los parámetros en QUERY STRING (URL),
 *    no en el cuerpo JSON.
 *
 * Soporta:
 *  - TEST y PROD (controlado por DHL_API_MODE en .env)
 *  - Basic Auth con usuario/contraseña de DHL
 *
 * Expone:
 *  - getDhlRawQuote(params)
 *  - getDhlCleanQuote(params)
 */

const axios = require('axios');

// =========================
// Configuración desde .env
// =========================

// TEST vs PROD
const DHL_API_MODE = (process.env.DHL_API_MODE || 'TEST').toUpperCase(); // 'TEST' o 'PROD'

// URLs base (sin /rates, eso lo agregamos en el código)
const DHL_API_TEST_BASE_URL =
  process.env.DHL_API_TEST_BASE_URL || 'https://express.api.dhl.com/mydhlapi/test';
const DHL_API_PROD_BASE_URL =
  process.env.DHL_API_PROD_BASE_URL || 'https://express.api.dhl.com/mydhlapi';

// Credenciales TEST (las puedes tener como TEST_ o como genéricas)
const DHL_API_TEST_USERNAME = process.env.DHL_API_TEST_USERNAME || process.env.DHL_API_USERNAME;
const DHL_API_TEST_PASSWORD = process.env.DHL_API_TEST_PASSWORD || process.env.DHL_API_PASSWORD;
const DHL_API_TEST_ACCOUNT_NUMBER =
  process.env.DHL_API_TEST_ACCOUNT_NUMBER || process.env.DHL_API_ACCOUNT_NUMBER || '984196483';

// Credenciales PROD (cuando las tengas)
const DHL_API_PROD_USERNAME = process.env.DHL_API_PROD_USERNAME || '';
const DHL_API_PROD_PASSWORD = process.env.DHL_API_PROD_PASSWORD || '';
const DHL_API_PROD_ACCOUNT_NUMBER = process.env.DHL_API_PROD_ACCOUNT_NUMBER || '';

// Versión de API (header x-version)
const DHL_API_VERSION = process.env.DHL_API_VERSION || '3.1.0';

// Valores fijos que definiste
const DHL_ORIGIN_COUNTRY_CODE = 'MX';
const DHL_DESTINATION_COUNTRY_CODE = 'MX';
const DHL_UNIT_OF_MEASUREMENT = 'metric';

// =========================
// Helpers internos
// =========================

/**
 * Obtiene la configuración correcta según el modo (TEST o PROD).
 */
function getEnvConfig() {
  if (DHL_API_MODE === 'PROD') {
    return {
      mode: 'PROD',
      baseUrl: DHL_API_PROD_BASE_URL, // ej: https://express.api.dhl.com/mydhlapi
      username: DHL_API_PROD_USERNAME,
      password: DHL_API_PROD_PASSWORD,
      accountNumber: DHL_API_PROD_ACCOUNT_NUMBER
    };
  }

  // Por defecto: TEST
  return {
    mode: 'TEST',
    baseUrl: DHL_API_TEST_BASE_URL, // ej: https://express.api.dhl.com/mydhlapi/test
    username: DHL_API_TEST_USERNAME,
    password: DHL_API_TEST_PASSWORD,
    accountNumber: DHL_API_TEST_ACCOUNT_NUMBER
  };
}

/**
 * Construye los parámetros de la query string para /rates.
 *
 * DHL espera algo así:
 *   /rates?accountNumber=...&originCountryCode=MX&originPostalCode=...&...
 *
 * params = {
 *   originPostalCode: string,
 *   originCityName: string,
 *   destinationPostalCode: string,
 *   destinationCityName: string,
 *   weight: number,
 *   length: number,
 *   width: number,
 *   height: number,
 *   plannedShippingDate?: string (YYYY-MM-DD) -> si no viene, usa hoy
 * }
 */
function buildQueryParams(params, accountNumber) {
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
  } = params;

  // Si no nos pasan fecha, usamos la fecha de hoy (YYYY-MM-DD)
  let shippingDate = plannedShippingDate;
  if (!shippingDate) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    shippingDate = `${yyyy}-${mm}-${dd}`;
  }

  // TODOS los parámetros según lo que definiste
  return {
    accountNumber: accountNumber,
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
    plannedShippingDate: shippingDate,
    isCustomsDeclarable: false,
    unitOfMeasurement: DHL_UNIT_OF_MEASUREMENT,
    nextBusinessDay: true
  };
}

/**
 * Extrae un resumen "limpio" de la respuesta de DHL.
 * NOTA: Ajustaremos esta parte exacta cuando tengamos tus JSON reales
 * (normal, zona extendida, manejo especial).
 */
function extractCleanSummary(dhlResponse) {
  let firstProduct = null;
  let totalPrice = null;
  let currency = null;
  let deliveryDate = null;
  let extendedArea = false;
  let specialHandling = false;

  if (Array.isArray(dhlResponse?.products) && dhlResponse.products.length > 0) {
    firstProduct = dhlResponse.products[0];

    if (Array.isArray(firstProduct.totalPrice) && firstProduct.totalPrice.length > 0) {
      const mainPriceRow = firstProduct.totalPrice[0];
      totalPrice = mainPriceRow.price ?? null;
      currency = mainPriceRow.currency ?? null;
    }

    deliveryDate =
      firstProduct.deliveryTime ||
      firstProduct.deliveryDate ||
      firstProduct.estimatedDeliveryDate ||
      null;

    const breakdown = Array.isArray(firstProduct.breakdown)
      ? firstProduct.breakdown
      : [];

    for (const item of breakdown) {
      const type = (item.type || '').toUpperCase();
      const name = (item.name || '').toUpperCase();
      const desc = (item.description || '').toUpperCase();
      const fullText = `${type} ${name} ${desc}`;

      if (fullText.includes('EXTENDED') || fullText.includes('REMOTE')) {
        extendedArea = true;
      }
      if (
        fullText.includes('SPECIAL') ||
        fullText.includes('OVERSIZE') ||
        fullText.includes('OVER SIZE') ||
        fullText.includes('LARGE')
      ) {
        specialHandling = true;
      }
    }
  }

  return {
    success: true,
    price: totalPrice,
    currency,
    deliveryDate,
    extendedArea,
    specialHandling,
    product: firstProduct,
    raw: dhlResponse
  };
}

// =========================
// Funciones públicas
// =========================

/**
 * Llama al API de DHL y devuelve la respuesta CRUDA
 * usando GET y query params.
 */
async function getDhlRawQuote(params) {
  const env = getEnvConfig();

  if (!env.username || !env.password) {
    throw new Error(
      `Faltan credenciales DHL para modo ${env.mode}. Revisa tu archivo .env`
    );
  }

  const baseUrl = env.baseUrl.replace(/\/$/, '');
  const url = `${baseUrl}/rates`;

  const queryParams = buildQueryParams(params, env.accountNumber);

  try {
    console.log('[DHL] Enviando petición (GET):', {
      mode: env.mode,
      url,
      queryParamsPreview: queryParams
    });

    const response = await axios.get(url, {
      auth: {
        username: env.username,
        password: env.password
      },
      headers: {
        Accept: 'application/json',
        'x-version': DHL_API_VERSION
      },
      params: queryParams,
      timeout: 15000
    });

    return {
      success: true,
      mode: env.mode,
      url,
      queryParams,
      dhlResponse: response.data
    };
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;

    console.error('[DHL] Error en la petición:', {
      mode: env.mode,
      url,
      status,
      data
    });

    return {
      success: false,
      mode: env.mode,
      url,
      queryParams,
      error: {
        message: error.message,
        status,
        data
      }
    };
  }
}

/**
 * Llama a DHL y devuelve un resumen "limpio" para el frontend.
 */
async function getDhlCleanQuote(params) {
  const rawResult = await getDhlRawQuote(params);

  if (!rawResult.success) {
    return {
      success: false,
      error: rawResult.error,
      mode: rawResult.mode,
      url: rawResult.url,
      queryParams: rawResult.queryParams
    };
  }

  const summary = extractCleanSummary(rawResult.dhlResponse);

  return {
    ...summary,
    mode: rawResult.mode,
    url: rawResult.url,
    queryParams: rawResult.queryParams
  };
}

module.exports = {
  getDhlRawQuote,
  getDhlCleanQuote
};

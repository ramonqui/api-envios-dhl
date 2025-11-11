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
 *
 * Y ahora:
 *  - Interpreta products[*] filtrando sólo productCode en {1, O, N, G}
 *  - Calcula el precio base sumando detailedPriceBreakdown[0].breakdown[*].price
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

// Credenciales TEST
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

// Product codes que SÍ queremos mostrar
const ALLOWED_PRODUCT_CODES = new Set(['1', 'O', 'N', 'G']);

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
      baseUrl: DHL_API_PROD_BASE_URL,
      username: DHL_API_PROD_USERNAME,
      password: DHL_API_PROD_PASSWORD,
      accountNumber: DHL_API_PROD_ACCOUNT_NUMBER
    };
  }

  // Por defecto: TEST
  return {
    mode: 'TEST',
    baseUrl: DHL_API_TEST_BASE_URL,
    username: DHL_API_TEST_USERNAME,
    password: DHL_API_TEST_PASSWORD,
    accountNumber: DHL_API_TEST_ACCOUNT_NUMBER
  };
}

/**
 * Construye los parámetros de la query string para /rates.
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
 * Intenta obtener la mejor entrada de detailedPriceBreakdown para un producto.
 * Normalmente usaremos la que tenga currencyType = 'BILLC', si existe.
 */
function selectDetailedPriceBreakdownGroup(product) {
  const dpb = Array.isArray(product.detailedPriceBreakdown)
    ? product.detailedPriceBreakdown
    : [];

  if (dpb.length === 0) return null;
  if (dpb.length === 1) return dpb[0];

  const billc = dpb.find((g) => g.currencyType === 'BILLC');
  return billc || dpb[0];
}

/**
 * Determina si en el breakdown hay zona extendida o manejo especial
 * usando heurísticas basadas en el nombre del cargo.
 */
function detectFlagsFromBreakdown(breakdownItems) {
  let extendedArea = false;
  let specialHandling = false;

  for (const item of breakdownItems) {
    const name = (item.name || '').toUpperCase();
    const serviceCode = (item.serviceCode || '').toUpperCase();
    const serviceTypeCode = (item.serviceTypeCode || '').toUpperCase();
    const full = `${name} ${serviceCode} ${serviceTypeCode}`;

    // Zona extendida: nombres típicos como "REMOTE AREA", "REMOTE AREA DELIVERY", etc.
    if (
      full.includes('REMOTE AREA') ||
      full.includes('REMOTEAREA') ||
      full.includes('REMOTE AREA DELIVERY') ||
      full.includes('REMOTE AREA PICKUP')
    ) {
      extendedArea = true;
    }

    // Manejo especial: oversize, large piece, special handling, etc.
    if (
      full.includes('OVERSIZE') ||
      full.includes('OVER SIZE') ||
      full.includes('LARGE PIECE') ||
      full.includes('SPECIAL HANDLING') ||
      full.includes('SPECIAL')
    ) {
      specialHandling = true;
    }
  }

  return { extendedArea, specialHandling };
}

/**
 * Extrae un resumen "limpio" de la respuesta de DHL.
 *
 * - Filtra sólo productos con productCode en {1, O, N, G}
 * - Para cada producto:
 *    - productName  -> nombre del servicio
 *    - dhlPrice     -> suma de breakdown[*].price en detailedPriceBreakdown[0]
 */
function extractCleanSummary(dhlResponse) {
  const products = Array.isArray(dhlResponse?.products) ? dhlResponse.products : [];
  const services = [];

  for (const product of products) {
    const code = String(product.productCode || '').trim();
    if (!ALLOWED_PRODUCT_CODES.has(code)) {
      continue; // ignoramos productos no deseados
    }

    const productName = product.productName || '';
    const deliveryDate =
      product.deliveryTime ||
      product.deliveryDate ||
      product.estimatedDeliveryDate ||
      null;

    const group = selectDetailedPriceBreakdownGroup(product);
    if (!group || !Array.isArray(group.breakdown)) {
      // Si no hay detailedPriceBreakdown, lo saltamos
      continue;
    }

    const breakdownItems = group.breakdown;

    // Precio base de DHL: suma de todos los "price" en breakdown
    let dhlPrice = 0;
    for (const item of breakdownItems) {
      const price = Number(item.price);
      if (!isNaN(price)) {
        dhlPrice += price;
      }
    }

    const currency = group.priceCurrency || null;
    const { extendedArea, specialHandling } = detectFlagsFromBreakdown(breakdownItems);

    services.push({
      productCode: code,
      productName,
      currency,
      dhlPrice,
      deliveryDate,
      extendedArea,
      specialHandling,
      detailedPriceBreakdown: group,
      rawProduct: product
    });
  }

  const primaryService = services.length > 0 ? services[0] : null;

  return {
    success: true,
    services,
    primaryService,
    // Para compatibilidad con lógica anterior:
    price: primaryService ? primaryService.dhlPrice : null,
    currency: primaryService ? primaryService.currency : null,
    deliveryDate: primaryService ? primaryService.deliveryDate : null,
    extendedArea: primaryService ? primaryService.extendedArea : false,
    specialHandling: primaryService ? primaryService.specialHandling : false,
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
 * Llama a DHL y devuelve un resumen "limpio" para el backend/frontend.
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

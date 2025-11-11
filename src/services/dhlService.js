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
 * Interpreta la respuesta de DHL así:
 *  - Filtra productos con productCode en {1, O, N, G}
 *  - Usa productName como nombre del servicio
 *  - Calcula:
 *      dhlBasePrice           = suma de breakdown.price EXCLUYENDO:
 *                              "REMOTE AREA DELIVERY", "OVERWEIGHT PIECE", "OVERSIZE PIECE"
 *      dhlExtendedSurcharge   = suma de breakdown.price con "REMOTE AREA ... "
 *      dhlSpecialSurcharge    = suma de breakdown.price con "OVERWEIGHT PIECE" o "OVERSIZE PIECE"
 *      dhlTotalPrice          = base + extended + special
 *  - Toma la fecha estimada de entrega de:
 *      product.deliveryCapabilities.estimatedDeliveryDateAndTime
 *    por ejemplo "2025-11-12T23:59:00"
 */

const axios = require('axios');

// =========================
// Configuración desde .env
// =========================

const DHL_API_MODE = (process.env.DHL_API_MODE || 'TEST').toUpperCase(); // 'TEST' o 'PROD'

const DHL_API_TEST_BASE_URL =
  process.env.DHL_API_TEST_BASE_URL || 'https://express.api.dhl.com/mydhlapi/test';
const DHL_API_PROD_BASE_URL =
  process.env.DHL_API_PROD_BASE_URL || 'https://express.api.dhl.com/mydhlapi';

const DHL_API_TEST_USERNAME = process.env.DHL_API_TEST_USERNAME || process.env.DHL_API_USERNAME;
const DHL_API_TEST_PASSWORD = process.env.DHL_API_TEST_PASSWORD || process.env.DHL_API_PASSWORD;
const DHL_API_TEST_ACCOUNT_NUMBER =
  process.env.DHL_API_TEST_ACCOUNT_NUMBER || process.env.DHL_API_ACCOUNT_NUMBER || '984196483';

const DHL_API_PROD_USERNAME = process.env.DHL_API_PROD_USERNAME || '';
const DHL_API_PROD_PASSWORD = process.env.DHL_API_PROD_PASSWORD || '';
const DHL_API_PROD_ACCOUNT_NUMBER = process.env.DHL_API_PROD_ACCOUNT_NUMBER || '';

const DHL_API_VERSION = process.env.DHL_API_VERSION || '3.1.0';

const DHL_ORIGIN_COUNTRY_CODE = 'MX';
const DHL_DESTINATION_COUNTRY_CODE = 'MX';
const DHL_UNIT_OF_MEASUREMENT = 'metric';

// Sólo queremos productos con estos códigos
const ALLOWED_PRODUCT_CODES = new Set(['1', 'O', 'N', 'G']);

// =========================
// Helpers internos
// =========================

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
 * De los detailedPriceBreakdown de un producto, elegimos el grupo principal:
 * - Preferimos currencyType = "BILLC" si existe.
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
 * Extrae y separa precios base / zona extendida / manejo especial.
 */
function computePricesFromBreakdown(breakdownItems) {
  let basePrice = 0;
  let extendedSurcharge = 0;
  let specialSurcharge = 0;

  for (const item of breakdownItems) {
    const price = Number(item.price);
    if (isNaN(price)) continue;

    const name = (item.name || '').toUpperCase().trim();

    // Zona extendida
    if (name.includes('REMOTE AREA DELIVERY') || name.includes('REMOTE AREA')) {
      extendedSurcharge += price;
      continue;
    }

    // Manejo especial (sobrepeso / sobredimensión)
    if (
      name.includes('OVERWEIGHT PIECE') ||
      name.includes('OVERSIZE PIECE') ||
      name.includes('OVERSIZED PIECE')
    ) {
      specialSurcharge += price;
      continue;
    }

    // Todo lo demás lo consideramos parte del precio base
    basePrice += price;
  }

  return {
    basePrice,
    extendedSurcharge,
    specialSurcharge,
    totalPrice: basePrice + extendedSurcharge + specialSurcharge
  };
}

/**
 * Interpreta la respuesta completa de DHL:
 * - products[*] filtrando por productCode
 * - por cada uno calculamos base / recargos / total
 * - leemos EXPLÍCITAMENTE:
 *     product.deliveryCapabilities.estimatedDeliveryDateAndTime
 */
function extractCleanSummary(dhlResponse) {
  const products = Array.isArray(dhlResponse?.products) ? dhlResponse.products : [];
  const services = [];

  for (const product of products) {
    const code = String(product.productCode || '').trim();
    if (!ALLOWED_PRODUCT_CODES.has(code)) {
      continue;
    }

    const productName = product.productName || '';

    // 👇 AQUÍ EL CAMBIO IMPORTANTE:
    // Buscamos la fecha de entrega donde realmente viene en tu JSON:
    // product.deliveryCapabilities.estimatedDeliveryDateAndTime
    const deliveryDateTime =
      product.deliveryCapabilities?.estimatedDeliveryDateAndTime ||
      product.estimatedDeliveryDateAndTime ||
      product.deliveryTime ||
      product.deliveryDate ||
      product.estimatedDeliveryDate ||
      null;

    const deliveryDate =
      deliveryDateTime && deliveryDateTime.includes('T')
        ? deliveryDateTime.split('T')[0]
        : deliveryDateTime;

    const group = selectDetailedPriceBreakdownGroup(product);
    if (!group || !Array.isArray(group.breakdown)) {
      continue;
    }

    const breakdownItems = group.breakdown;
    const prices = computePricesFromBreakdown(breakdownItems);

    const currency = group.priceCurrency || null;
    const extendedArea = prices.extendedSurcharge > 0;
    const specialHandling = prices.specialSurcharge > 0;

    services.push({
      productCode: code,
      productName,
      currency,
      dhlBasePrice: prices.basePrice,                 // base sin zona extendida / manejo especial
      dhlExtendedSurcharge: prices.extendedSurcharge, // REMOTE AREA DELIVERY
      dhlSpecialSurcharge: prices.specialSurcharge,   // OVERWEIGHT / OVERSIZE
      dhlTotalPrice: prices.totalPrice,               // base + recargos
      deliveryDateTime,                               // ISO completo: "2025-11-12T23:59:00"
      deliveryDate,                                   // sólo fecha: "2025-11-12"
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
    // Compatibilidad con lógica anterior:
    price: primaryService ? primaryService.dhlBasePrice : null,
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

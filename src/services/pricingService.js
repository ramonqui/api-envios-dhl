// /Users/macbookpro/proyectos/dhl-guias-api/src/services/pricingService.js

const { getDhlConfig, getDhlQuote } = require('./dhlService');
const { getCpInfoOrThrow } = require('./postalService'); // tu servicio que valida CP y devuelve {municipio, estado}
const { roundUpInt, computeVolumetricKg, maxShipmentWeight } = require('../utils/weight');
const { formatDeliveryDisplay } = require('../utils/deliveryFormat');
const { applyAdminRules } = require('./rulesService'); // ya creado en tu proyecto
const logger = require('../utils/logger');

/**
 * Normaliza y redondea hacia arriba pesos/dimensiones
 */
function normalizeDims({ weight, length, width, height }) {
  const W = Math.ceil(Number(weight || 0));
  const L = Math.ceil(Number(length || 0));
  const Wi = Math.ceil(Number(width || 0));
  const H = Math.ceil(Number(height || 0));
  return { W, L, Wi, H };
}

/**
 * Construye params para DHL GET /rates con querystring
 */
function buildDhlParams({
  accountNumber,
  originCp, originCity, destCp, destCity,
  weight, length, width, height,
  plannedShippingDate,
}) {
  return {
    accountNumber,
    originCountryCode: 'MX',
    originPostalCode: originCp,
    originCityName: originCity,
    destinationCountryCode: 'MX',
    destinationPostalCode: destCp,
    destinationCityName: destCity,
    weight,
    length,
    width,
    height,
    plannedShippingDate,    // YYYY-MM-DD
    isCustomsDeclarable: false,
    unitOfMeasurement: 'metric',
    nextBusinessDay: true,
  };
}

/**
 * Filtra productos por códigos permitidos: 1, O, N, G
 */
function isAllowedProduct(code) {
  const c = String(code || '').toUpperCase();
  return c === '1' || c === 'O' || c === 'N' || c === 'G';
}

/**
 * Extrae estimatedDeliveryDateAndTime del producto DHL
 */
function extractEta(product) {
  return product?.deliveryCapabilities?.estimatedDeliveryDateAndTime || null;
}

/**
 * Suma el "price" de breakdown al nivel superior (BILLC / MXN).
 * Además detecta extras: REMOTE AREA DELIVERY, OVERWEIGHT PIECE, OVERSIZE PIECE
 */
function breakdownMxSum(product) {
  const dpb = product?.detailedPriceBreakdown;
  if (!Array.isArray(dpb)) return { base: 0, extraRemote: 0, extraOverweight: 0, extraOversize: 0 };

  const mx = dpb.find(b => b.currencyType === 'BILLC' && b.priceCurrency === 'MXN');
  if (!mx || !Array.isArray(mx.breakdown)) return { base: 0, extraRemote: 0, extraOverweight: 0, extraOversize: 0 };

  let base = 0, extraRemote = 0, extraOverweight = 0, extraOversize = 0;

  for (const item of mx.breakdown) {
    const name = (item?.name || '').toUpperCase();
    const price = Number(item?.price || 0);

    // Suma base (todo lo que tenga "price")
    if (price > 0) base += price;

    // Detectar extras específicos
    if (name.includes('REMOTE AREA DELIVERY')) extraRemote += price;
    if (name.includes('OVERWEIGHT PIECE'))     extraOverweight += price;
    if (name.includes('OVERSIZE PIECE'))       extraOversize += price;
  }

  return { base, extraRemote, extraOverweight, extraOversize };
}

/**
 * Servicio principal: genera cotización para un usuario.
 * - Valida CPs con tu API
 * - Completa municipios como cityName para DHL
 * - Redondea dimensiones
 * - Calcula peso volumétrico y el usado
 * - Llama a DHL
 * - Filtra productos y arma opciones con deliveryDisplay formateado
 * - Aplica reglas admin (porcentaje/fijo/suma fija) y redondea hacia arriba
 * - Suma extras (zona extendida / piezas sobredimensionadas o sobrepeso) + markup de admin para extras
 */
async function quoteForUser(user, payload) {
  const startedAt = Date.now();
  try {
    // 1) Validar/obtener info de CPs
    const originCp = String(payload.originPostalCode || '').trim();
    const destCp   = String(payload.destinationPostalCode || '').trim();

    if (!/^\d{5}$/.test(originCp) || !/^\d{5}$/.test(destCp)) {
      return {
        status: 'error',
        message: 'Códigos postales inválidos (5 dígitos requeridos).',
        type: 'VALIDATION_ERROR',
      };
    }

    const originInfo = await getCpInfoOrThrow(originCp); // { municipio, estado }
    const destInfo   = await getCpInfoOrThrow(destCp);

    // 2) Normalizar dimensiones
    const { W, L, Wi, H } = normalizeDims(payload);

    // 3) Peso volumétrico y usado
    const volumetricWeight = computeVolumetricKg(L, Wi, H); // (L*W*H)/5000
    const shipmentWeightUsed = maxShipmentWeight(W, volumetricWeight); // mayor entre físico y volumétrico

    // 4) Fecha planeada (YYYY-MM-DD)
    const planned = (payload.plannedShippingDate || new Date().toISOString().slice(0, 10));

    // 5) DHL params
    const cfg = getDhlConfig();
    const dhlParams = buildDhlParams({
      accountNumber: cfg.accountNumber,
      originCp,
      originCity: originInfo.municipio,
      destCp,
      destCity: destInfo.municipio,
      weight: shipmentWeightUsed,
      length: L,
      width: Wi,
      height: H,
      plannedShippingDate: planned,
    });

    logger.info('[pricingService] solicitando DHL rates', { dhlParams, mode: cfg.mode });

    // 6) Llamar a DHL
    const dhlResp = await getDhlQuote(dhlParams);

    if (dhlResp.status !== 'ok') {
      logger.error('[pricingService] DHL error', dhlResp);
      return {
        status: 'error',
        message: 'No se pudo obtener la cotización.',
        type: 'PRICING_SERVICE_ERROR',
        details: dhlResp,
      };
    }

    const products = Array.isArray(dhlResp.data?.products) ? dhlResp.data.products : [];
    const allowed = products.filter(p => isAllowedProduct(p?.productCode));

    // 7) Construir opciones
    const options = [];
    for (const p of allowed) {
      const { base, extraRemote, extraOverweight, extraOversize } = breakdownMxSum(p);
      const etaIso = extractEta(p);
      const deliveryDisplay = formatDeliveryDisplay({
        productCode: p.productCode,
        isoString: etaIso,
      });

      // Aplica reglas admin al componente base
      const baseAfterRule = applyAdminRules({
        role: user?.rol || 'MINORISTA',
        weightKg: shipmentWeightUsed,
        basePrice: base,
      });

      // Ganancia admin para extras
      const extrasMarkup = applyAdminRules({
        role: user?.rol || 'MINORISTA',
        weightKg: shipmentWeightUsed,
        basePrice: extraRemote + extraOverweight + extraOversize,
        isExtra: true, // tu rulesService puede decidir otra lógica para extras
      });

      // Totales (redondeados hacia arriba)
      const priceBaseAfterRule = roundUpInt(baseAfterRule);
      const extrasAfterRule    = roundUpInt(extrasMarkup);
      const totalWithExtras    = roundUpInt(priceBaseAfterRule + extrasAfterRule);

      options.push({
        productCode: p.productCode,
        productName: p.productName,
        deliveryDisplay,
        baseMx: Math.ceil(base),
        extras: {
          remoteArea: Math.ceil(extraRemote),
          overweight: Math.ceil(extraOverweight),
          oversize: Math.ceil(extraOversize),
          extrasAfterRule,
        },
        priceBaseAfterRule,
        totalWithExtras,
      });
    }

    const tookMs = Date.now() - startedAt;
    logger.info('[pricingService] quoteForUser ok', { count: options.length, tookMs });

    return {
      status: 'ok',
      cpValidation: {
        origin: { cp: originCp, municipio: originInfo.municipio, estado: originInfo.estado },
        destination: { cp: destCp, municipio: destInfo.municipio, estado: destInfo.estado },
      },
      requestEcho: {
        weight: W, length: L, width: Wi, height: H,
        volumetricWeight,
        shipmentWeightUsed,
        plannedShippingDate: planned,
      },
      options,
    };
  } catch (err) {
    logger.error('[pricingService] quoteForUser error', err);
    return {
      status: 'error',
      message: 'No se pudo obtener la cotización.',
      type: 'PRICING_SERVICE_ERROR',
      details: {
        message: err.message,
        stack: err.stack,
      },
    };
  }
}

module.exports = { quoteForUser };

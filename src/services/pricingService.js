// /Users/macbookpro/proyectos/dhl-guias-api/src/services/pricingService.js

/**
 * Servicio de pricing:
 * - Llama a DHL usando weight = params.shipmentWeightUsed (mayor entre volumétrico y físico).
 * - Suma "detailedPriceBreakdown" (MXN, currencyType BILLC o PULCL).
 * - Identifica recargos REMOTE AREA DELIVERY / OVERWEIGHT PIECE / OVERSIZE PIECE.
 * - Aplica regla de ganancia según rol/config.
 * - REDONDEA hacia arriba (ceil) TODOS los precios que mostramos al cliente.
 * - Filtra por productCode: ["1","O","N","G"].
 * - Da formato de fecha de entrega y expone campos de control.
 */

const axios = require('axios');
const { buildDhlRatesUrl } = require('./dhlService'); // tu helper que construye URL con querystring (GET)
const { getRolePricingRules } = require('./rulesService'); // tu servicio de reglas por rol (porcentaje/fijo/suma fija)
const { formatDeliveryDisplay } = require('../utils/deliveryFormat'); // tu helper para formato de fecha/hora

// Helpers locales
const ceilMoney = (n) => Math.ceil(Number(n || 0));
const sum = (arr) => arr.reduce((a, b) => a + Number(b || 0), 0);

// DHL solo acepta estos servicios en tu negocio
const ALLOWED_CODES = new Set(['1', 'O', 'N', 'G']);

/**
 * Extrae el precio base de DHL sumando el breakdown relevante (MXN).
 * Intenta primero currencyType BILLC; si no, PULCL.
 */
function extractDhlBasePriceMXN(product) {
  if (!product?.detailedPriceBreakdown?.length) return 0;

  // Busca bloque en MXN, prioriza BILLC
  const block =
    product.detailedPriceBreakdown.find((b) => b.priceCurrency === 'MXN' && b.currencyType === 'BILLC') ||
    product.detailedPriceBreakdown.find((b) => b.priceCurrency === 'MXN' && b.currencyType === 'PULCL');

  if (!block?.breakdown?.length) return 0;

  // Suma todos los "price" del breakdown (EXPRESS DOMESTIC, DEMAND SURCHARGE, FUEL SURCHARGE, etc.)
  const base = sum(block.breakdown.map((item) => item.price || 0));
  return base;
}

/**
 * Detecta recargos (MXN) que te interesan: REMOTE AREA DELIVERY, OVERWEIGHT PIECE, OVERSIZE PIECE.
 * Regresa objeto { remoteFee, overweightFee, oversizeFee }
 */
function extractSpecialFeesMXN(product) {
  const result = { remoteFee: 0, overweightFee: 0, oversizeFee: 0 };
  if (!product?.detailedPriceBreakdown?.length) return result;

  const block =
    product.detailedPriceBreakdown.find((b) => b.priceCurrency === 'MXN' && b.currencyType === 'BILLC') ||
    product.detailedPriceBreakdown.find((b) => b.priceCurrency === 'MXN' && b.currencyType === 'PULCL');

  if (!block?.breakdown?.length) return result;

  for (const item of block.breakdown) {
    const name = String(item?.name || '').toUpperCase();

    if (name.includes('REMOTE AREA DELIVERY')) {
      result.remoteFee = Number(item.price || 0);
    }
    if (name.includes('OVERWEIGHT PIECE')) {
      result.overweightFee = Number(item.price || 0);
    }
    if (name.includes('OVERSIZE PIECE')) {
      result.oversizeFee = Number(item.price || 0);
    }
  }
  return result;
}

/**
 * Aplica la regla de ganancia configurada para el rol del usuario, por rango de peso.
 * modes: percentage / fixed_override / fixed_add
 * Retorna precio cliente (antes de extras) y detalle.
 */
function applyProfitRule(baseMXN, shipmentWeightUsed, roleRules) {
  const rule = roleRules.pickRuleForWeight(shipmentWeightUsed);

  // Sin regla -> precio base sin cambios
  if (!rule) {
    return {
      mode: 'none',
      ruleRef: null,
      priceClient: baseMXN
    };
  }

  const mode = rule.mode; // 'percentage' | 'fixed_override' | 'fixed_add'
  let priceClient = baseMXN;

  if (mode === 'percentage') {
    // aumenta % sobre base
    priceClient = baseMXN * (1 + (Number(rule.value) || 0) / 100);
  } else if (mode === 'fixed_override') {
    // ignora base, coloca precio fijo
    priceClient = Number(rule.value || 0);
  } else if (mode === 'fixed_add') {
    // suma fija a la base
    priceClient = baseMXN + Number(rule.value || 0);
  }

  return {
    mode,
    ruleRef: rule,
    priceClient
  };
}

/**
 * Aplica ganancias para cargos adicionales (zona extendida y manejo especial) si existen.
 * Retorna objeto con extras ya con ganancia y total de extras.
 */
function applyExtrasProfit(extrasMXN, roleRules) {
  const { remoteFee, overweightFee, oversizeFee } = extrasMXN;

  const conf = roleRules.getExtrasGain(); // por ejemplo { remote: {mode, value}, special: {mode, value} }

  function applyOne(fee, gainConf) {
    if (!fee || fee <= 0 || !gainConf) return 0;
    const mode = gainConf.mode; // 'percentage' | 'fixed_add'
    let final = fee;
    if (mode === 'percentage') {
      final = fee * (1 + (Number(gainConf.value) || 0) / 100);
    } else if (mode === 'fixed_add') {
      final = fee + Number(gainConf.value || 0);
    }
    return final;
  }

  const remoteWithGain   = applyOne(remoteFee,   conf?.remote);
  const overweightWithGain = applyOne(overweightFee, conf?.special);
  const oversizeWithGain   = applyOne(oversizeFee,   conf?.special);

  const extrasTotal = remoteWithGain + overweightWithGain + oversizeWithGain;

  return {
    remoteWithGain,
    overweightWithGain,
    oversizeWithGain,
    extrasTotal
  };
}

/**
 * Llama a DHL (GET) usando weight = params.shipmentWeightUsed y construye opciones.
 */
async function quoteForUser(user, params) {
  try {
    const {
      originPostalCode,
      originCityName,
      destinationPostalCode,
      destinationCityName,
      plannedShippingDate,
      shipmentWeightUsed, // clave
      // guardamos también estos por si los quieres mostrar:
      weightRounded, lengthRounded, widthRounded, heightRounded, volumetricWeight
    } = params;

    // Construir URL para DHL (GET /rates?...), usando tu helper preexistente
    const url = buildDhlRatesUrl({
      accountNumber: process.env.DHL_ACCOUNT_NUMBER,
      originCountryCode: 'MX',
      originPostalCode,
      originCityName,
      destinationCountryCode: 'MX',
      destinationPostalCode,
      destinationCityName,
      weight: shipmentWeightUsed, // **peso tarifario**
      length: lengthRounded,
      width:  widthRounded,
      height: heightRounded,
      plannedShippingDate,
      isCustomsDeclarable: false,
      unitOfMeasurement: 'metric',
      nextBusinessDay: true
    });

    const headers = {
      'x-version': process.env.DHL_API_VERSION || '3.1.0'
    };

    const auth = {
      username: process.env.DHL_API_USERNAME,
      password: process.env.DHL_API_PASSWORD
    };

    const resp = await axios.get(url, { headers, auth });
    const data = resp?.data;
    const products = Array.isArray(data?.products) ? data.products : [];

    // Reglas/ganancias por rol
    const roleRules = await getRolePricingRules(user.rol || 'MINORISTA');

    // Construir opciones filtradas
    const options = [];

    for (const p of products) {
      const code = String(p.productCode || '').trim();
      if (!ALLOWED_CODES.has(code)) continue;

      // Precio base DHL (MXN)
      const baseMXN = extractDhlBasePriceMXN(p);

      // Recargos especiales detectados
      const extrasMXN = extractSpecialFeesMXN(p);

      // Aplicar ganancia al precio base
      const applied = applyProfitRule(baseMXN, shipmentWeightUsed, roleRules);

      // Aplicar ganancia a extras
      const extrasApplied = applyExtrasProfit(extrasMXN, roleRules);

      // Total antes de redondeo
      const subtotalBeforeRound = applied.priceClient;
      const totalWithExtrasBeforeRound = applied.priceClient + extrasApplied.extrasTotal;

      // *** Requisito: redondear hacia arriba los costos mostrados ***
      const priceBaseAfterRule   = ceilMoney(subtotalBeforeRound);
      const totalWithExtras      = ceilMoney(totalWithExtrasBeforeRound);
      const remoteWithGainCeil   = ceilMoney(extrasApplied.remoteWithGain);
      const overweightWithGainCeil = ceilMoney(extrasApplied.overweightWithGain);
      const oversizeWithGainCeil   = ceilMoney(extrasApplied.oversizeWithGain);

      const deliveryISO = p?.deliveryCapabilities?.estimatedDeliveryDateAndTime || null;
      const deliveryDisplay = formatDeliveryDisplay({
        productCode: code,
        isoString: deliveryISO
      });

      options.push({
        productCode: code,
        productName: p.productName || null,

        // Muestra de fecha amigable
        deliveryISO,
        deliveryDisplay,

        // Precios (ya redondeados hacia arriba)
        priceDhlBase: ceilMoney(baseMXN),
        priceBaseAfterRule,
        zoneExtendedFee: remoteWithGainCeil,
        specialHandlingFee: ceilMoney(overweightWithGainCeil + oversizeWithGainCeil),
        totalWithExtras,

        // Diagnóstico y contexto
        debug: {
          weightUsed: shipmentWeightUsed,
          weightRounded, lengthRounded, widthRounded, heightRounded, volumetricWeight,
          baseMXN,
          appliedRuleMode: applied.mode,
          extrasMXN,
          extrasApplied: {
            remoteWithGain: remoteWithGainCeil,
            overweightWithGain: overweightWithGainCeil,
            oversizeWithGain: oversizeWithGainCeil
          }
        }
      });
    }

    return {
      status: 'ok',
      type: 'DYNAMIC_PRICING',
      options
    };
  } catch (error) {
    console.error('[pricingService] quoteForUser error:', error?.response?.data || error?.message || error);
    return {
      status: 'error',
      message: 'No se pudo obtener la cotización.',
      type: 'PRICING_SERVICE_ERROR',
      error: error?.response?.data || error?.message || 'sin detalle'
    };
  }
}

module.exports = { quoteForUser };

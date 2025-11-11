// /Users/macbookpro/proyectos/dhl-guias-api/src/services/pricingService.js

/**
 * Servicio de pricing:
 * - Integra DHL (getDhlCleanQuote)
 * - Aplica reglas de precio por rol y rango de peso (pricing_rules)
 * - Aplica recargos de zona extendida / manejo especial (dhl_surcharge_config)
 * - Maneja créditos para usuarios con rol MERCADOLIBRE (ml_credits)
 *
 * Lógica actual:
 *  - DHL devuelve múltiples servicios (1, O, N, G)
 *  - Cada servicio trae:
 *      dhlBasePrice           (sin REMOTE AREA / OVERWEIGHT / OVERSIZE)
 *      dhlExtendedSurcharge   (REMOTE AREA DELIVERY)
 *      dhlSpecialSurcharge    (OVERWEIGHT / OVERSIZE PIECE)
 *      deliveryDateTime       (ISO: "2025-11-12T23:59:00")
 *  - Para REVENDEDOR, MAYORISTA, MINORISTA:
 *      1) Regla sobre dhlBasePrice → priceBaseAfterRule
 *      2) Zona extendida:
 *           extendedFinal = (dhlExtendedSurcharge > 0)
 *                           ? dhlExtendedSurcharge + extended_area_fee
 *      3) Manejo especial:
 *           specialFinal = (dhlSpecialSurcharge > 0)
 *                          ? dhlSpecialSurcharge + special_handling_fee
 *      4) finalPrice = priceBaseAfterRule + extendedFinal + specialFinal
 *
 *  - Formato de fecha/hora para el usuario:
 *      * N y G → solo fecha: "Martes 8 de Noviembre 2025"
 *      * Resto (1, O, etc.) → fecha + hora: "Martes 8 de Noviembre 2025 09:26"
 */

const { getDhlCleanQuote } = require('./dhlService');
const {
  getPricingRuleForRoleAndWeight,
  getDhlSurchargeConfig
} = require('../models/pricingModel');
const {
  getAvailableCreditsForUserAndWeight
} = require('../models/mlCreditsModel');

// ===================================
// Helpers para formato de fecha/hora
// ===================================

const DAYS_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado'
];

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
];

function formatDateEs(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }

  const dayName = DAYS_ES[date.getDay()];
  const day = date.getDate(); // 1-31
  const monthNameRaw = MONTHS_ES[date.getMonth()] || '';
  const monthName =
    monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1); // "Noviembre"
  const year = date.getFullYear();

  return `${dayName} ${day} de ${monthName} ${year}`;
}

function formatTimeEs(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Genera el string final de entrega según el productCode.
 * - N / G  -> sólo fecha
 * - otros  -> fecha + hora
 */
function buildDeliveryDisplay(productCode, isoString) {
  if (!isoString) return null;

  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    // Si no se puede parsear, devolvemos tal cual la cadena ISO
    return isoString;
  }

  const datePart = formatDateEs(d);
  const timePart = formatTimeEs(d);

  if (!datePart) return isoString;

  const code = (productCode || '').toUpperCase();

  if (code === 'N' || code === 'G') {
    // Sólo fecha
    return datePart;
  }

  // Otros servicios (1, O, etc.): fecha + hora
  if (timePart) {
    return `${datePart} ${timePart}`;
  }

  return datePart;
}

// ===================================
// Lógica principal
// ===================================

async function quoteForUser(user, shipmentParams) {
  const userRole = (user.rol || user.role || '').toUpperCase();

  const dhlResult = await getDhlCleanQuote(shipmentParams);

  if (!dhlResult.success) {
    return {
      status: 'error',
      type: 'DHL_ERROR',
      message: 'No se pudo obtener la cotización de DHL.',
      dhl_error: dhlResult.error,
      mode: dhlResult.mode,
      url: dhlResult.url
    };
  }

  if (userRole === 'MERCADOLIBRE') {
    return await handleMercadoLibreQuote(user, shipmentParams, dhlResult);
  }

  if (['REVENDEDOR', 'MAYORISTA', 'MINORISTA'].includes(userRole)) {
    return await handleDynamicPricingQuote(user, userRole, shipmentParams, dhlResult);
  }

  return {
    status: 'ok',
    mode: dhlResult.mode,
    role: userRole,
    type: 'INFO_ONLY',
    message: 'Rol sin reglas de precio configuradas. Se devuelven todas las opciones de DHL.',
    dhl_services: dhlResult.services
  };
}

/**
 * REVENDEDOR, MAYORISTA, MINORISTA
 */
async function handleDynamicPricingQuote(user, userRole, shipmentParams, dhlResult) {
  const weight = Number(shipmentParams.weight);
  if (!weight || isNaN(weight)) {
    return {
      status: 'error',
      type: 'INVALID_WEIGHT',
      message: 'Peso inválido para la cotización.'
    };
  }

  const services = Array.isArray(dhlResult.services) ? dhlResult.services : [];
  if (services.length === 0) {
    return {
      status: 'error',
      type: 'NO_DHL_SERVICES',
      message: 'DHL no devolvió servicios disponibles para esta ruta.'
    };
  }

  const rule = await getPricingRuleForRoleAndWeight(userRole, weight);
  if (!rule) {
    return {
      status: 'error',
      type: 'NO_PRICING_RULE',
      message: `No hay regla de precio configurada para el rol ${userRole} y el peso ${weight} kg.`
    };
  }

  const surchargeConfig = await getDhlSurchargeConfig();
  const extendedAreaFee = Number(surchargeConfig?.extended_area_fee || 0);
  const specialHandlingFee = Number(surchargeConfig?.special_handling_fee || 0);

  const options = [];

  for (const svc of services) {
    const baseCostDhl = Number(
      svc.dhlBasePrice ??
      svc.dhlPrice ??
      svc.dhlTotalPrice ??
      0
    );
    if (isNaN(baseCostDhl) || baseCostDhl <= 0) {
      continue;
    }

    const dhlExtendedSurcharge = Number(svc.dhlExtendedSurcharge || 0);
    const dhlSpecialSurcharge = Number(svc.dhlSpecialSurcharge || 0);

    // 1) priceBaseAfterRule desde dhlBasePrice
    let priceBaseAfterRule = 0;

    switch (rule.mode) {
      case 'PERCENTAGE':
        priceBaseAfterRule = baseCostDhl * (1 + Number(rule.value) / 100);
        break;
      case 'FIXED_PRICE':
        priceBaseAfterRule = Number(rule.value);
        break;
      case 'MARKUP_AMOUNT':
        priceBaseAfterRule = baseCostDhl + Number(rule.value);
        break;
      default:
        return {
          status: 'error',
          type: 'UNKNOWN_PRICING_MODE',
          message: `Modo de pricing desconocido: ${rule.mode}`
        };
    }

    // 2) Zona extendida
    let extendedFinal = 0;
    if (dhlExtendedSurcharge > 0) {
      extendedFinal = dhlExtendedSurcharge + extendedAreaFee;
    }

    // 3) Manejo especial
    let specialFinal = 0;
    if (dhlSpecialSurcharge > 0) {
      specialFinal = dhlSpecialSurcharge + specialHandlingFee;
    }

    const extraCharges = extendedFinal + specialFinal;
    const finalPrice = priceBaseAfterRule + extraCharges;

    // 4) Formato amigable de fecha/hora
    const deliveryIso = svc.deliveryDateTime || svc.deliveryDate || null;
    const deliveryDisplay = buildDeliveryDisplay(svc.productCode, deliveryIso);

    options.push({
      productCode: svc.productCode,
      productName: svc.productName,
      currency: svc.currency,
      dhlBasePrice: baseCostDhl,
      dhlExtendedSurcharge,
      dhlSpecialSurcharge,
      dhlTotalPrice: svc.dhlTotalPrice,
      deliveryIso,
      deliveryDisplay, // <- lo que mostrará el frontend
      extendedArea: dhlExtendedSurcharge > 0,
      specialHandling: dhlSpecialSurcharge > 0,
      breakdown: {
        basePriceDhl: baseCostDhl,
        priceBaseAfterRule,
        extendedFinal,
        specialFinal,
        extraCharges
      },
      finalPrice
    });
  }

  if (options.length === 0) {
    return {
      status: 'error',
      type: 'NO_VALID_OPTIONS',
      message: 'No se pudieron calcular opciones de precio válidas.'
    };
  }

  const finalPrices = options.map((o) => o.finalPrice);
  const minFinalPrice = Math.min(...finalPrices);
  const maxFinalPrice = Math.max(...finalPrices);

  return {
    status: 'ok',
    type: 'DYNAMIC_PRICING',
    role: userRole,
    user_id: user.id,
    dhlMode: dhlResult.mode,
    dhlQueryParams: dhlResult.queryParams,
    pricingRule: {
      id: rule.id,
      mode: rule.mode,
      value: Number(rule.value),
      currency: rule.currency,
      weight_min_kg: Number(rule.weight_min_kg),
      weight_max_kg: Number(rule.weight_max_kg)
    },
    surchargeConfig: {
      extended_area_fee: extendedAreaFee,
      special_handling_fee: specialHandlingFee
    },
    summary: {
      currency: options[0].currency,
      minFinalPrice,
      maxFinalPrice,
      servicesCount: options.length
    },
    options
  };
}

/**
 * MERCADOLIBRE: créditos + servicios DHL disponibles.
 */
async function handleMercadoLibreQuote(user, shipmentParams, dhlResult) {
  const weight = Number(shipmentParams.weight);
  if (!weight || isNaN(weight)) {
    return {
      status: 'error',
      type: 'INVALID_WEIGHT',
      message: 'Peso inválido para la cotización.'
    };
  }

  const availableCredits = await getAvailableCreditsForUserAndWeight(user.id, weight);

  if (!availableCredits || availableCredits.length === 0) {
    return {
      status: 'error',
      type: 'NO_CREDITS',
      message: 'No tienes créditos disponibles para este rango de peso.',
      role: 'MERCADOLIBRE',
      user_id: user.id,
      dhl_services: dhlResult.services || []
    };
  }

  const creditBlock = availableCredits[0];

  // También podríamos formatear deliveryDisplay aquí si quieres,
  // pero de momento dejamos los servicios crudos de DHL.
  return {
    status: 'ok',
    type: 'MERCADOLIBRE_CREDITS',
    role: 'MERCADOLIBRE',
    user_id: user.id,
    dhl_services: dhlResult.services || [],
    creditUsedCandidate: {
      id: creditBlock.id,
      weight_min_kg: Number(creditBlock.weight_min_kg),
      weight_max_kg: Number(creditBlock.weight_max_kg),
      credits_total: creditBlock.credits_total,
      credits_used: creditBlock.credits_used,
      credits_remaining: creditBlock.credits_remaining,
      expires_at: creditBlock.expires_at
    },
    allAvailableCredits: availableCredits.map((c) => ({
      id: c.id,
      weight_min_kg: Number(c.weight_min_kg),
      weight_max_kg: Number(c.weight_max_kg),
      credits_total: c.credits_total,
      credits_used: c.credits_used,
      credits_remaining: c.credits_remaining,
      expires_at: c.expires_at
    }))
  };
}

module.exports = {
  quoteForUser
};

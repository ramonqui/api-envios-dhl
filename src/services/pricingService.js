// /Users/macbookpro/proyectos/dhl-guias-api/src/services/pricingService.js

/**
 * Servicio de pricing:
 * - Integra DHL (getDhlCleanQuote)
 * - Aplica reglas de precio por rol y rango de peso (pricing_rules)
 * - Aplica recargos de zona extendida / manejo especial (dhl_surcharge_config)
 * - Maneja créditos para usuarios con rol MERCADOLIBRE (ml_credits)
 */

const { getDhlCleanQuote } = require('./dhlService');
const {
  getPricingRuleForRoleAndWeight,
  getDhlSurchargeConfig
} = require('../models/pricingModel');
const {
  getAvailableCreditsForUserAndWeight
} = require('../models/mlCreditsModel');

/**
 * Calcula el precio o disponibilidad de crédito
 * para un usuario y un envío específico.
 *
 * @param {Object} user - objeto con { id, email, rol }
 * @param {Object} shipmentParams - parámetros del envío:
 *  {
 *    originPostalCode,
 *    originCityName,
 *    destinationPostalCode,
 *    destinationCityName,
 *    weight,
 *    length,
 *    width,
 *    height,
 *    plannedShippingDate
 *  }
 */
async function quoteForUser(user, shipmentParams) {
  const userRole = (user.rol || user.role || '').toUpperCase();

  // Primero, siempre consultamos DHL para saber si el envío es válido
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

  // MERCADOLIBRE -> créditos
  if (userRole === 'MERCADOLIBRE') {
    return await handleMercadoLibreQuote(user, shipmentParams, dhlResult);
  }

  // REVENDEDOR, MAYORISTA, MINORISTA -> reglas dinámicas
  if (['REVENDEDOR', 'MAYORISTA', 'MINORISTA'].includes(userRole)) {
    return await handleDynamicPricingQuote(user, userRole, shipmentParams, dhlResult);
  }

  // Otros roles (ej. ADMIN) -> solo info de DHL
  return {
    status: 'ok',
    mode: dhlResult.mode,
    role: userRole,
    type: 'INFO_ONLY',
    message: 'Rol sin reglas de precio configuradas. Se devuelve solo información de DHL.',
    dhl: {
      price: dhlResult.price,
      currency: dhlResult.currency,
      deliveryDate: dhlResult.deliveryDate,
      extendedArea: dhlResult.extendedArea,
      specialHandling: dhlResult.specialHandling
    }
  };
}

/**
 * Maneja la cotización para REVENDEDOR, MAYORISTA, MINORISTA.
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

  if (dhlResult.price == null) {
    return {
      status: 'error',
      type: 'DHL_NO_PRICE',
      message: 'DHL no devolvió un precio base para este envío.'
    };
  }

  const baseCostDhl = Number(dhlResult.price);

  // 1) Obtenemos la regla de pricing para el rol y el peso
  const rule = await getPricingRuleForRoleAndWeight(userRole, weight);
  if (!rule) {
    return {
      status: 'error',
      type: 'NO_PRICING_RULE',
      message: `No hay regla de precio configurada para el rol ${userRole} y el peso ${weight} kg.`
    };
  }

  // 2) Obtenemos la config de recargos DHL
  const surchargeConfig = await getDhlSurchargeConfig();
  const extendedAreaFee = surchargeConfig?.extended_area_fee || 0;
  const specialHandlingFee = surchargeConfig?.special_handling_fee || 0;

  // 3) Calculamos el precio base según la regla
  let priceBase = 0;

  switch (rule.mode) {
    case 'PERCENTAGE':
      // value = porcentaje (ej. 20 => 20%)
      priceBase = baseCostDhl * (1 + Number(rule.value) / 100);
      break;
    case 'FIXED_PRICE':
      // value = precio fijo final
      priceBase = Number(rule.value);
      break;
    case 'MARKUP_AMOUNT':
      // value = monto fijo a sumar
      priceBase = baseCostDhl + Number(rule.value);
      break;
    default:
      return {
        status: 'error',
        type: 'UNKNOWN_PRICING_MODE',
        message: `Modo de pricing desconocido: ${rule.mode}`
      };
  }

  // 4) Recargos por zona extendida / manejo especial
  let extraCharges = 0;
  const extraDetails = {};

  if (dhlResult.extendedArea) {
    extraCharges += extendedAreaFee;
    extraDetails.extendedAreaFee = extendedAreaFee;
  }
  if (dhlResult.specialHandling) {
    extraCharges += specialHandlingFee;
    extraDetails.specialHandlingFee = specialHandlingFee;
  }

  const finalPrice = priceBase + extraCharges;

  return {
    status: 'ok',
    type: 'DYNAMIC_PRICING',
    role: userRole,
    user_id: user.id,
    dhl: {
      mode: dhlResult.mode,
      basePriceFromDhl: baseCostDhl,
      currency: dhlResult.currency,
      deliveryDate: dhlResult.deliveryDate,
      extendedArea: dhlResult.extendedArea,
      specialHandling: dhlResult.specialHandling
    },
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
    breakdown: {
      basePriceDhl: baseCostDhl,
      priceBaseAfterRule: priceBase,
      extraCharges,
      ...extraDetails
    },
    finalPrice: finalPrice
  };
}

/**
 * Maneja la cotización para MERCADOLIBRE (usa créditos).
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
      dhl_info: {
        mode: dhlResult.mode,
        deliveryDate: dhlResult.deliveryDate,
        extendedArea: dhlResult.extendedArea,
        specialHandling: dhlResult.specialHandling
      }
    };
  }

  const creditBlock = availableCredits[0];

  return {
    status: 'ok',
    type: 'MERCADOLIBRE_CREDITS',
    role: 'MERCADOLIBRE',
    user_id: user.id,
    dhl_info: {
      mode: dhlResult.mode,
      deliveryDate: dhlResult.deliveryDate,
      extendedArea: dhlResult.extendedArea,
      specialHandling: dhlResult.specialHandling
    },
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

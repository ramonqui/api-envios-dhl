// /Users/macbookpro/proyectos/dhl-guias-api/src/services/pricingService.js

/**
 * Servicio de pricing:
 * - Integra DHL (getDhlCleanQuote)
 * - Aplica reglas de precio por rol y rango de peso (pricing_rules)
 * - Aplica recargos de zona extendida / manejo especial (dhl_surcharge_config)
 * - Maneja créditos para usuarios con rol MERCADOLIBRE (ml_credits)
 *
 * AHORA:
 * - Trabaja con TODOS los servicios devueltos por DHL (1, O, N, G)
 * - Calcula precio final por servicio
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
 */
async function quoteForUser(user, shipmentParams) {
  const userRole = (user.rol || user.role || '').toUpperCase();

  // Siempre consultamos DHL primero
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

  // Otros roles (ej. ADMIN) -> sólo info de DHL
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
 * Maneja la cotización para REVENDEDOR, MAYORISTA, MINORISTA.
 * Devuelve una lista de opciones (una por cada servicio DHL permitido).
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

  // 1) Obtenemos la regla de pricing para el rol y el peso
  const rule = await getPricingRuleForRoleAndWeight(userRole, weight);
  if (!rule) {
    return {
      status: 'error',
      type: 'NO_PRICING_RULE',
      message: `No hay regla de precio configurada para el rol ${userRole} y el peso ${weight} kg.`
    };
  }

  // 2) Obtenemos la config de recargos DHL (zona extendida, manejo especial)
  const surchargeConfig = await getDhlSurchargeConfig();
  const extendedAreaFee = Number(surchargeConfig?.extended_area_fee || 0);
  const specialHandlingFee = Number(surchargeConfig?.special_handling_fee || 0);

  // 3) Calculamos el precio final por cada servicio DHL
  const options = [];

  for (const svc of services) {
    const baseCostDhl = Number(svc.dhlPrice);
    if (isNaN(baseCostDhl)) {
      continue; // si por alguna razón no hay precio numérico, lo saltamos
    }

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

    let extraCharges = 0;
    const extraDetails = {};

    if (svc.extendedArea) {
      extraCharges += extendedAreaFee;
      extraDetails.extendedAreaFee = extendedAreaFee;
    }
    if (svc.specialHandling) {
      extraCharges += specialHandlingFee;
      extraDetails.specialHandlingFee = specialHandlingFee;
    }

    const finalPrice = priceBase + extraCharges;

    options.push({
      productCode: svc.productCode,
      productName: svc.productName,
      currency: svc.currency,
      dhlPrice: baseCostDhl,
      deliveryDate: svc.deliveryDate,
      extendedArea: svc.extendedArea,
      specialHandling: svc.specialHandling,
      breakdown: {
        basePriceDhl: baseCostDhl,
        priceBaseAfterRule: priceBase,
        extraCharges,
        ...extraDetails
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

  // Para comodidad del frontend, devolvemos también rango de precios
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
    options // <- lista de servicios con su precio final
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
      dhl_services: dhlResult.services || []
    };
  }

  const creditBlock = availableCredits[0];

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

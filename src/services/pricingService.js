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
 *  - Para REVENDEDOR, MAYORISTA, MINORISTA:
 *      1) Se aplica la regla (PERCENTAGE / FIXED_PRICE / MARKUP_AMOUNT)
 *         sobre dhlBasePrice ⇒ priceBaseAfterRule
 *      2) Si hay dhlExtendedSurcharge > 0:
 *           extendedFinal = dhlExtendedSurcharge + extended_area_fee
 *      3) Si hay dhlSpecialSurcharge > 0:
 *           specialFinal = dhlSpecialSurcharge + special_handling_fee
 *      4) finalPrice = priceBaseAfterRule + extendedFinal + specialFinal
 */

const { getDhlCleanQuote } = require('./dhlService');
const {
  getPricingRuleForRoleAndWeight,
  getDhlSurchargeConfig
} = require('../models/pricingModel');
const {
  getAvailableCreditsForUserAndWeight
} = require('../models/mlCreditsModel');

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

    // 1) Calculamos priceBaseAfterRule a partir del baseCostDhl
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
      // Tomamos el precio de DHL y le sumamos la ganancia del admin
      extendedFinal = dhlExtendedSurcharge + extendedAreaFee;
    }

    // 3) Manejo especial
    let specialFinal = 0;
    if (dhlSpecialSurcharge > 0) {
      // Tomamos el precio de DHL y le sumamos la ganancia del admin
      specialFinal = dhlSpecialSurcharge + specialHandlingFee;
    }

    const extraCharges = extendedFinal + specialFinal;
    const finalPrice = priceBaseAfterRule + extraCharges;

    options.push({
      productCode: svc.productCode,
      productName: svc.productName,
      currency: svc.currency,
      dhlBasePrice: baseCostDhl,
      dhlExtendedSurcharge,
      dhlSpecialSurcharge,
      dhlTotalPrice: svc.dhlTotalPrice,
      deliveryDate: svc.deliveryDate,
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
 * MERCADOLIBRE: sólo créditos, pero ahora también devolvemos los servicios DHL
 * para saber qué opciones existen.
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

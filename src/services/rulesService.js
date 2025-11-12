// /Users/macbookpro/proyectos/dhl-guias-api/src/services/rulesService.js

/**
 * Servicio de reglas de pricing por ROL y por RANGO DE PESO.
 *
 * Estructura de reglas (por defecto):
 * {
 *   "MINORISTA": {
 *     "weightRules": [
 *       { "maxKg": 1,  "mode": "percentage",    "value": 35 },
 *       { "maxKg": 5,  "mode": "percentage",    "value": 32 },
 *       { "maxKg": 10, "mode": "percentage",    "value": 30 },
 *       { "maxKg": 20, "mode": "percentage",    "value": 28 },
 *       { "maxKg": 30, "mode": "percentage",    "value": 25 }
 *     ],
 *     "extras": {
 *       "remote": { "mode": "percentage", "value": 20 }, // Zona extendida
 *       "special": { "mode": "percentage", "value": 15 } // Overweight/Oversize
 *     }
 *   },
 *   "MAYORISTA": { ... },
 *   "REVENDEDOR": { ... },
 *   "MERCADOLIBRE": { ... } // Suele trabajar con créditos; aquí dejamos ganancia 0 por defecto
 * }
 *
 * Modes soportados:
 * - "percentage":   aplica un % sobre el precio base de DHL
 * - "fixed_add":    suma fija en MXN sobre el precio base
 * - "fixed_override": ignora el precio de DHL y usa un precio fijo (no recomendado si hay muchos rangos)
 *
 * ⚙️ Sobrescritura por ENV:
 * - Si defines PRICING_RULES_JSON en .env con un JSON válido, se usará en lugar del default.
 */

function loadConfigFromEnv() {
  try {
    if (!process.env.PRICING_RULES_JSON) return null;
    const parsed = JSON.parse(process.env.PRICING_RULES_JSON);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    console.warn('[rulesService] PRICING_RULES_JSON inválido, se ignora. Error:', e.message);
    return null;
  }
}

// Reglas por defecto (ajústalas si deseas)
const DEFAULT_RULES = {
  MINORISTA: {
    weightRules: [
      { maxKg: 1,  mode: 'percentage', value: 35 },
      { maxKg: 5,  mode: 'percentage', value: 32 },
      { maxKg: 10, mode: 'percentage', value: 30 },
      { maxKg: 20, mode: 'percentage', value: 28 },
      { maxKg: 30, mode: 'percentage', value: 25 }
    ],
    extras: {
      remote:  { mode: 'percentage', value: 20 }, // REMOTE AREA DELIVERY
      special: { mode: 'percentage', value: 15 }  // OVERWEIGHT/OVERSIZE
    }
  },
  MAYORISTA: {
    weightRules: [
      { maxKg: 1,  mode: 'percentage', value: 25 },
      { maxKg: 5,  mode: 'percentage', value: 22 },
      { maxKg: 10, mode: 'percentage', value: 20 },
      { maxKg: 20, mode: 'percentage', value: 18 },
      { maxKg: 30, mode: 'percentage', value: 15 }
    ],
    extras: {
      remote:  { mode: 'percentage', value: 15 },
      special: { mode: 'percentage', value: 10 }
    }
  },
  REVENDEDOR: {
    weightRules: [
      { maxKg: 1,  mode: 'percentage', value: 18 },
      { maxKg: 5,  mode: 'percentage', value: 16 },
      { maxKg: 10, mode: 'percentage', value: 14 },
      { maxKg: 20, mode: 'percentage', value: 12 },
      { maxKg: 30, mode: 'percentage', value: 10 }
    ],
    extras: {
      remote:  { mode: 'percentage', value: 10 },
      special: { mode: 'percentage', value: 8 }
    }
  },
  MERCADOLIBRE: {
    // MercadoLibre usa créditos por rango de peso. Aquí dejamos la ganancia en 0
    // (el frontend mostrará disponibilidad de crédito por rango).
    weightRules: [
      { maxKg: 1,  mode: 'percentage', value: 0 },
      { maxKg: 5,  mode: 'percentage', value: 0 },
      { maxKg: 10, mode: 'percentage', value: 0 },
      { maxKg: 20, mode: 'percentage', value: 0 },
      { maxKg: 30, mode: 'percentage', value: 0 }
    ],
    extras: {
      remote:  { mode: 'percentage', value: 0 },
      special: { mode: 'percentage', value: 0 }
    }
  }
};

/**
 * Dada una lista de reglas {maxKg, mode, value}, elige la que corresponda para el peso.
 * - Si no hay coincidencia por maxKg, regresa la última (mayor rango).
 * - Si no existe ninguna, regresa null.
 */
function pickRuleForWeightFactory(weightRules = []) {
  const ordered = [...weightRules].sort((a, b) => Number(a.maxKg) - Number(b.maxKg));
  return function pickRuleForWeight(weightKg) {
    if (!Array.isArray(ordered) || ordered.length === 0) return null;
    const w = Number(weightKg || 0);
    for (const r of ordered) {
      if (w <= Number(r.maxKg)) return r;
    }
    return ordered[ordered.length - 1] || null;
  };
}

/**
 * Devuelve un objeto de API con:
 *  - pickRuleForWeight(weightKg)
 *  - getExtrasGain() -> { remote: {mode, value}, special: {mode, value} }
 */
async function getRolePricingRules(role = 'MINORISTA') {
  const envConfig = loadConfigFromEnv();
  const source = envConfig || DEFAULT_RULES;

  const key = String(role || 'MINORISTA').toUpperCase();
  const roleCfg = source[key] || source.MINORISTA;

  return {
    pickRuleForWeight: pickRuleForWeightFactory(roleCfg.weightRules),
    getExtrasGain: () => roleCfg.extras || { remote: { mode: 'percentage', value: 0 }, special: { mode: 'percentage', value: 0 } }
  };
}

module.exports = {
  getRolePricingRules
};

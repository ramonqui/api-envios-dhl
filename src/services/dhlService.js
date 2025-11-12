// /Users/macbookpro/proyectos/dhl-guias-api/src/services/dhlService.js

const axios = require('axios');
const qs = require('querystring');

/**
 * Lee modo y credenciales desde .env (TEST o PROD)
 */
function getDhlConfig() {
  const MODE = (process.env.DHL_API_MODE || 'TEST').toUpperCase();

  const cfg = {
    mode: MODE,
    version: process.env.DHL_API_VERSION || '3.1.0',
    baseUrl:
      MODE === 'PROD'
        ? (process.env.DHL_API_PROD_BASE_URL || 'https://express.api.dhl.com/mydhlapi')
        : (process.env.DHL_API_TEST_BASE_URL || 'https://express.api.dhl.com/mydhlapi/test'),
    username:
      MODE === 'PROD'
        ? process.env.DHL_API_PROD_USERNAME
        : process.env.DHL_API_TEST_USERNAME,
    password:
      MODE === 'PROD'
        ? process.env.DHL_API_PROD_PASSWORD
        : process.env.DHL_API_TEST_PASSWORD,
    accountNumber:
      MODE === 'PROD'
        ? process.env.DHL_API_PROD_ACCOUNT_NUMBER
        : process.env.DHL_API_TEST_ACCOUNT_NUMBER
  };

  if (!cfg.username || !cfg.password || !cfg.accountNumber) {
    const missing = [];
    if (!cfg.username) missing.push('username');
    if (!cfg.password) missing.push('password');
    if (!cfg.accountNumber) missing.push('accountNumber');
    const m = `Faltan variables DHL (${MODE}): ${missing.join(', ')}`;
    throw new Error(m);
  }
  return cfg;
}

/**
 * Construye la URL completa GET /rates con querystring.
 * DHL NO acepta body JSON para rates, todos los parámetros van en la URL.
 */
function buildDhlRatesUrl(params = {}) {
  const { baseUrl } = getDhlConfig();
  const ratesUrl = `${baseUrl.replace(/\/$/, '')}/rates`;
  const query = qs.stringify(params);
  return `${ratesUrl}?${query}`;
}

/**
 * Llama a DHL con Basic Auth y header x-version. Devuelve JSON.
 */
async function getDhlQuote(params = {}) {
  const cfg = getDhlConfig();

  // Inserta accountNumber si no viene desde arriba
  if (!params.accountNumber) {
    params.accountNumber = cfg.accountNumber;
  }

  const url = buildDhlRatesUrl(params);

  const headers = { 'x-version': cfg.version };

  try {
    const response = await axios.get(url, {
      auth: { username: cfg.username, password: cfg.password },
      headers,
      timeout: 30000
    });
    return { status: 'ok', data: response.data, url, mode: cfg.mode };
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;

    // DHL suele mandar 401/403 con "Invalid Credentials"
    let mapped = {
      status: 'error',
      message: 'No se pudo obtener la cotización.',
      type: 'DHL_API_ERROR',
      error: data || err.message,
      httpStatus: status,
      url,
      mode: cfg.mode
    };

    if (status === 401 || status === 403) {
      mapped.type = 'INVALID_CREDENTIALS';
      mapped.error = data || { reasons: [{ msg: 'Invalid Credentials' }] };
    }
    return mapped;
  }
}

module.exports = {
  getDhlConfig,
  buildDhlRatesUrl,
  getDhlQuote
};

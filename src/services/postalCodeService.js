// /Users/macbookpro/proyectos/dhl-guias-api/src/services/postalCodeService.js

/**
 * Servicio para validar códigos postales usando:
 *
 *   GET https://api-codigos-postales-mx-production.up.railway.app/api/cp/:cp
 *
 * Requiere:
 *   Header: X-Api-Key: <CP_API_KEY>
 *
 * Formato esperado de respuesta:
 * {
 *   "cp": "50110",
 *   "total": 8,
 *   "resultados": [
 *     {
 *       "cp": "50110",
 *       "asentamiento": "...",
 *       "municipio": "Toluca",
 *       "estado": "México",
 *       "ciudad": "Toluca de Lerdo",
 *       ...
 *     },
 *     ...
 *   ]
 * }
 *
 * Usamos el primer resultado para extraer:
 *   municipio, estado, ciudad, zona, etc.
 */

const axios = require('axios');

const CP_API_BASE_URL =
  process.env.CP_API_BASE_URL ||
  'https://api-codigos-postales-mx-production.up.railway.app';

const CP_API_KEY = process.env.CP_API_KEY || '';

/**
 * Valida el formato del CP (exactamente 5 dígitos)
 * y consulta la API externa para verificar existencia
 * y extraer municipio/estado/ciudad.
 *
 * Devuelve:
 *  - ok: true/false
 *  - cp
 *  - municipio / estado / ciudad / zona (si ok)
 *  - raw: respuesta completa de la API de CP
 *  - error, message, status, details (si falla)
 */
async function lookupPostalCode(cp) {
  const cpStr = String(cp || '').trim();

  const cpRegex = /^[0-9]{5}$/;
  if (!cpRegex.test(cpStr)) {
    return {
      ok: false,
      error: 'FORMATO_INVALIDO',
      message: 'El código postal debe tener exactamente 5 dígitos numéricos.'
    };
  }

  if (!CP_API_KEY) {
    return {
      ok: false,
      error: 'MISSING_API_KEY',
      message: 'No está configurada la clave CP_API_KEY para la API de códigos postales.'
    };
  }

  const baseUrl = CP_API_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/api/cp/${cpStr}`;

  try {
    const resp = await axios.get(url, {
      headers: {
        'X-Api-Key': CP_API_KEY
      },
      timeout: 8000
    });

    const data = resp.data;

    if (!data || !Array.isArray(data.resultados) || data.resultados.length === 0) {
      return {
        ok: false,
        error: 'CP_NO_ENCONTRADO',
        message: 'El código postal no existe en el catálogo.',
        cp: cpStr,
        raw: data
      };
    }

    const r0 = data.resultados[0];

    return {
      ok: true,
      cp: data.cp || cpStr,
      municipio: r0.municipio || null,
      estado: r0.estado || null,
      ciudad: r0.ciudad || null,
      zona: r0.zona || null,
      raw: data
    };
  } catch (err) {
    const status = err.response?.status;

    return {
      ok: false,
      error: 'CP_API_ERROR',
      message: 'Error al consultar el servicio de códigos postales.',
      status,
      details: err.response?.data || err.message
    };
  }
}

module.exports = {
  lookupPostalCode
};

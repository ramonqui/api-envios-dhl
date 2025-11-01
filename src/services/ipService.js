const axios = require('axios');

const IPREGISTRY_BASE_URL = 'https://api.ipregistry.co';

async function fetchIpInfo(ip, apiKey) {
  // si no hay API key, devolvemos algo básico para no romper el registro
  if (!apiKey) {
    return {
      ip,
      location: {
        country: { name: null },
        city: null
      }
    };
  }

  try {
    // si no pasamos ip, ipregistry detecta la ip del request,
    // pero aquí vamos a pasársela nosotros
    const url = `${IPREGISTRY_BASE_URL}/${ip}?key=${apiKey}`;
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    console.error('Error consultando ipregistry:', error.message);
    // no rompemos el flujo, devolvemos algo básico
    return {
      ip,
      location: {
        country: { name: null },
        city: null
      }
    };
  }
}

module.exports = {
  fetchIpInfo
};

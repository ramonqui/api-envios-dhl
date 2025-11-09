// /Users/macbookpro/proyectos/dhl-guias-api/test_dhl.js

require('dotenv').config();
const { getDhlCleanQuote } = require('./src/services/dhlService');

async function main() {
  try {
    const plannedShippingDate = '2025-11-08'; // o deja undefined para usar hoy

    const params = {
      originPostalCode: '50110',
      originCityName: 'Toluca',
      destinationPostalCode: '92800',
      destinationCityName: 'Tuxpan',
      weight: 1,
      length: 10,
      width: 10,
      height: 10,
      plannedShippingDate
    };

    console.log('=== Probando getDhlCleanQuote (QUERY PARAMS) ===');
    console.log('Parámetros:', params);

    const result = await getDhlCleanQuote(params);

    console.log('\n=== Resultado ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error inesperado en test_dhl:', err);
  }
}

main();

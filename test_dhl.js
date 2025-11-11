// /Users/macbookpro/proyectos/dhl-guias-api/test_dhl.js

require('dotenv').config();
const { getDhlCleanQuote } = require('./src/services/dhlService');

async function main() {
  try {
    const params = {
      originPostalCode: '50110',
      originCityName: 'Toluca',
      destinationPostalCode: '06000',
      destinationCityName: 'T',
      weight: 1,
      length: 10,
      width: 10,
      height: 10,
      plannedShippingDate: '2025-11-08'
    };

    console.log('=== Probando getDhlCleanQuote ===');
    console.log('Parámetros:', params);

    const result = await getDhlCleanQuote(params);

    console.log('\n=== Resultado limpio (services) ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error inesperado en test_dhl:', err);
  }
}

main();

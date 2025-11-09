// /Users/macbookpro/proyectos/dhl-guias-api/test_dhl.js

/**
 * Script de prueba para el API de DHL.
 *
 * Uso:
 *   node test_dhl.js
 *
 * Asegúrate de:
 *  - Tener el archivo .env con las variables DHL_ configuradas.
 *  - Estar en la carpeta del proyecto: /Users/macbookpro/proyectos/dhl-guias-api
 */

require('dotenv').config(); // carga variables de .env

const { getDhlRateQuote } = require('./src/services/dhlService');

async function main() {
  try {
    // Parámetros de ejemplo:
    // Puedes cambiarlos para simular distintos escenarios.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const plannedShippingDate = `${yyyy}-${mm}-${dd}`;

    const params = {
      originPostalCode: '50110',        // variable según el usuario (ej. Toluca)
      originCityName: 'Toluca',         // variable según el usuario
      destinationPostalCode: '92800',   // variable según el usuario
      destinationCityName: 'Tuxpan',    // AJUSTA según lo que quieras probar
      weight: 1,                        // kg
      length: 10,                       // cm (asumiendo métrico)
      width: 10,                        // cm
      height: 10,                       // cm
      plannedShippingDate,              // fecha de hoy en formato YYYY-MM-DD
      isCustomsDeclarable: false,
      unitOfMeasurement: 'metric',
      nextBusinessDay: true
    };

    console.log('=== Probando cotización DHL ===');
    console.log('Parámetros enviados:', params);

    const result = await getDhlRateQuote(params);

    console.log('\n=== Resultado de DHL ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error inesperado en test_dhl:', err);
  }
}

main();

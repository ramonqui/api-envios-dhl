// /Users/macbookpro/proyectos/dhl-guias-api/src/utils/deliveryFormat.js

/**
 * Formatea la fecha estimada de entrega (ISO) a un texto legible en español (MX).
 * Reglas:
 * - Para productCode N y G: sólo FECHA.
 * - Para otros códigos: FECHA + HORA.
 * - Zona horaria: America/Mexico_City
 * Ejemplos:
 *   - "Miércoles 12 de Noviembre de 2025"
 *   - "Miércoles 12 de Noviembre de 2025 09:26"
 */

const DEFAULT_TZ = 'America/Mexico_City';

/**
 * Convierte una cadena a "Capitalizado Cada Palabra",
 * respetando las preposiciones comunes y conectores (de, del, la, y, etc.)
 * pero dejando la primera palabra capitalizada.
 */
function toTitleEs(str) {
  if (!str) return str;
  const lower = String(str).toLowerCase();

  // Palabras que suelen permanecer en minúsculas en español,
  // excepto cuando son la primera palabra.
  const keepLower = new Set(['de', 'del', 'la', 'el', 'y', 'a', 'en', 'por', 'para', 'con', 'o', 'u', 'e']);

  const words = lower.split(' ').filter(Boolean);
  return words
    .map((w, idx) => {
      if (idx === 0) return w.charAt(0).toUpperCase() + w.slice(1);
      return keepLower.has(w) ? w : (w.charAt(0).toUpperCase() + w.slice(1));
    })
    .join(' ');
}

/**
 * Formatea una fecha ISO en español MX, devolviendo un string como:
 *  "miércoles, 12 de noviembre de 2025" (según Intl)
 *  Luego lo convertimos a "Miércoles 12 de Noviembre de 2025"
 */
function formatEsDate(isoString, timeZone = DEFAULT_TZ) {
  const date = new Date(isoString);

  const dateStr = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone
  }).format(date);

  // El formateador suele devolver "miércoles, 12 de noviembre de 2025"
  // Quitamos la coma y capitalizamos palabras.
  const cleaned = dateStr.replace(',', '');
  return toTitleEs(cleaned);
}

/**
 * Devuelve la hora HH:mm (24h) en la zona indicada.
 */
function formatEsTime(isoString, timeZone = DEFAULT_TZ) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone
  }).format(date);
}

/**
 * Punto de entrada usado por el servicio de pricing.
 * @param {Object} opts
 * @param {string} opts.productCode - código del producto (N, G, 1, O, etc.)
 * @param {string} opts.isoString  - fecha ISO "YYYY-MM-DDTHH:mm:ss"
 * @param {string} [opts.timeZone] - zona horaria (default MX)
 * @returns {string|null} Texto legible (fecha o fecha+hora) o null si no hay iso.
 */
function formatDeliveryDisplay({ productCode, isoString, timeZone = DEFAULT_TZ }) {
  if (!isoString) return null;

  const code = String(productCode || '').trim().toUpperCase();
  const dateText = formatEsDate(isoString, timeZone);

  // Para N y G -> solo fecha
  if (code === 'N' || code === 'G') {
    return dateText;
  }

  // Otros códigos -> fecha + hora
  const timeText = formatEsTime(isoString, timeZone);
  return `${dateText} ${timeText}`;
}

module.exports = { formatDeliveryDisplay, toTitleEs, formatEsDate, formatEsTime };

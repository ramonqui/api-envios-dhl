// /Users/macbookpro/proyectos/dhl-guias-api/src/utils/usernameGenerator.js

// Quita acentos y caracteres raros
function normalizeText(text) {
  if (!text) return '';
  return text
    .normalize('NFD')              // separa acentos
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-zA-Z0-9]/g, '')    // quita todo lo que no sea letra o número
    .toLowerCase();
}

/**
 * Genera un username básico combinando:
 * - nombre
 * - 3 letras del apellido
 * - 3 números aleatorios
 *
 * Ej: "Javier", "Quintana" -> "javierqui123"
 */
function generateBaseUsername(nombre, apellido) {
  const nombreClean = normalizeText(
    String(nombre || '').split(' ')[0] // solo la primera palabra del nombre
  );

  const apellidoClean = normalizeText(String(apellido || ''));

  const apellido3 = apellidoClean.slice(0, 3); // primeras 3 letras

  // 3 dígitos aleatorios
  const random = Math.floor(100 + Math.random() * 900); // 100-999

  // unir todo
  const base = `${nombreClean}${apellido3}${random}`;

  // por si quedó vacío por algún motivo
  return base || `user${random}`;
}

module.exports = {
  generateBaseUsername,
  normalizeText
};

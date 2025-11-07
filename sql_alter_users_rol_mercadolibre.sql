-- /Users/macbookpro/proyectos/dhl-guias-api/sql_alter_users_rol_mercadolibre.sql
-- Ajusta el tipo de la columna 'rol' para agregar el nuevo rol MERCADOLIBRE.
-- IMPORTANTE: Esto asume que la columna 'rol' es ENUM.
-- Si tu columna ya es VARCHAR, este script no es necesario.

ALTER TABLE users
  MODIFY COLUMN rol ENUM('ADMIN', 'REVENDEDOR', 'MAYORISTA', 'MINORISTA', 'MERCADOLIBRE')
  NOT NULL DEFAULT 'MINORISTA';

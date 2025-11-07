-- /Users/macbookpro/proyectos/dhl-guias-api/sql/001_pricing_and_credits.sql
-- Tablas para reglas de precios, configuración de recargos DHL y créditos MERCADOLIBRE

/* ==========================================================
   1) Tabla: pricing_rules
   - Reglas de precio por rol y rango de peso.
   - Aplica para roles: REVENDEDOR, MAYORISTA, MINORISTA.
   - No se usa para MERCADOLIBRE (ese va con créditos).
   ========================================================== */

CREATE TABLE IF NOT EXISTS pricing_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('REVENDEDOR','MAYORISTA','MINORISTA') NOT NULL,
  weight_min_kg DECIMAL(10,2) NOT NULL,
  weight_max_kg DECIMAL(10,2) NOT NULL,
  mode ENUM('PERCENTAGE','FIXED_PRICE','MARKUP_AMOUNT') NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_weight (role, weight_min_kg, weight_max_kg),
  INDEX idx_role_weight (role, weight_min_kg, weight_max_kg)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/*
  Ejemplos de cómo se interpretará esta tabla:

  - mode = 'PERCENTAGE', value = 20
      => precio_final_base = costo_dhl * (1 + 20/100)

  - mode = 'FIXED_PRICE', value = 150
      => precio_final_base = 150 (se ignora el costo de DHL)

  - mode = 'MARKUP_AMOUNT', value = 30
      => precio_final_base = costo_dhl + 30
*/


/* ==========================================================
   2) Tabla: dhl_surcharge_config
   - Configuración global de recargos:
       * Zona extendida
       * Manejo especial
   - Estos se suman al precio cuando el API de DHL indique
     que aplican dichos recargos.
   ========================================================== */

CREATE TABLE IF NOT EXISTS dhl_surcharge_config (
  id INT PRIMARY KEY,
  extended_area_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  special_handling_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insertar una fila de configuración por defecto (id = 1).
-- Si ya existe, se actualiza (ON DUPLICATE KEY UPDATE).
INSERT INTO dhl_surcharge_config (id, extended_area_fee, special_handling_fee, currency)
VALUES (1, 50.00, 30.00, 'MXN')
ON DUPLICATE KEY UPDATE
  extended_area_fee = VALUES(extended_area_fee),
  special_handling_fee = VALUES(special_handling_fee),
  currency = VALUES(currency);


/* ==========================================================
   3) Tabla: ml_credits
   - Créditos por rango de peso para usuarios con rol MERCADOLIBRE.
   - Los créditos se consumen al generar guías.
   ========================================================== */

CREATE TABLE IF NOT EXISTS ml_credits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  weight_min_kg DECIMAL(10,2) NOT NULL,
  weight_max_kg DECIMAL(10,2) NOT NULL,
  credits_total INT NOT NULL,
  credits_used INT NOT NULL DEFAULT 0,
  expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ml_user (user_id),
  INDEX idx_ml_weight (weight_min_kg, weight_max_kg),
  CONSTRAINT fk_ml_credits_user FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/*
  Ejemplo de uso de ml_credits:

  - user_id = 10, weight_min_kg = 0.00, weight_max_kg = 1.00,
    credits_total = 100, credits_used = 3

    => Tiene 97 créditos disponibles para envíos de 0 a 1 kg.

  - user_id = 10, weight_min_kg = 0.00, weight_max_kg = 5.00,
    credits_total = 50, credits_used = 10

    => Tiene 40 créditos disponibles para envíos de 0 a 5 kg.
*/

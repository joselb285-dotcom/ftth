-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOMERS — Gestión de abonados FTTH
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customers (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT         NOT NULL,
  project_id       UUID         REFERENCES projects(id)      ON DELETE SET NULL,
  sub_project_id   UUID         REFERENCES sub_projects(id)  ON DELETE SET NULL,
  feature_id       TEXT,        -- ID del elemento GIS (NAP, splice_box, etc.)

  -- Identificación
  name             TEXT         NOT NULL,
  document_type    TEXT         CHECK (document_type IN ('DNI','CUIT','CUIL','passport','other')),
  document_number  TEXT,
  address          TEXT,
  phone            TEXT,
  email            TEXT,

  -- Ciclo de vida del servicio
  status           TEXT         NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','suspended','cancelled')),
  service_type     TEXT         CHECK (service_type IN ('residential','business','enterprise')),
  plan_name        TEXT,
  plan_down_mbps   INTEGER,
  plan_up_mbps     INTEGER,
  monthly_fee      NUMERIC(10,2),
  install_date     DATE,
  cancel_date      DATE,
  cancel_reason    TEXT,

  -- Equipamiento GPON/ONU
  onu_model        TEXT,
  onu_serial       TEXT,
  onu_mac          TEXT,
  olt_host         TEXT,
  pon_port         INTEGER,
  optical_distance_m INTEGER,

  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_tenant_idx  ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS customers_status_idx  ON customers(tenant_id, status);
CREATE INDEX IF NOT EXISTS customers_serial_idx  ON customers(onu_serial) WHERE onu_serial IS NOT NULL;

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Política: acceso solo al propio tenant (misma lógica que projects)
CREATE POLICY "customers_tenant_rls" ON customers
  USING (
    tenant_id IN (
      SELECT t.id FROM tenants t
      WHERE t.id = customers.tenant_id
        AND EXISTS (
          SELECT 1 FROM user_profiles up
          WHERE up.id = auth.uid()
             OR up.admin_id = auth.uid()
        )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- MONITORING — Sistema NMS propio
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS monitoring_devices (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT         NOT NULL,
  name             TEXT         NOT NULL,
  type             TEXT         NOT NULL
                                CHECK (type IN ('olt','switch','router','onu','mikrotik','other')),
  vendor           TEXT,        -- huawei, zte, vsol, mikrotik, cisco, fiberhome, other
  model            TEXT,
  ip_address       TEXT,
  snmp_community   TEXT         DEFAULT 'public',
  snmp_version     TEXT         DEFAULT '2c',
  api_url          TEXT,        -- URL base de la API REST del equipo
  api_username     TEXT,
  api_password     TEXT,
  api_token        TEXT,
  poll_interval_s  INTEGER      DEFAULT 300,
  protocol         TEXT         NOT NULL DEFAULT 'manual'
                                CHECK (protocol IN ('snmp','http','manual')),
  -- alert thresholds (JSON): [{ metric_key, operator, threshold, severity, message }]
  alert_rules      JSONB        DEFAULT '[]',
  status           TEXT         NOT NULL DEFAULT 'unknown'
                                CHECK (status IN ('online','offline','degraded','unknown')),
  last_seen_at     TIMESTAMPTZ,
  feature_id       TEXT,        -- ID del elemento GIS (Nodo OLT, etc.)
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mon_devices_tenant_idx ON monitoring_devices(tenant_id);

ALTER TABLE monitoring_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mon_devices_tenant_rls" ON monitoring_devices
  USING (tenant_id IN (
    SELECT t.id FROM tenants t WHERE t.id = monitoring_devices.tenant_id
      AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() OR up.admin_id = auth.uid())
  ));

-- ── Métricas (serie temporal) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS monitoring_metrics (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    UUID         NOT NULL REFERENCES monitoring_devices(id) ON DELETE CASCADE,
  tenant_id    TEXT         NOT NULL,
  metric_key   TEXT         NOT NULL,   -- pon.power_dbm | interface.rx_bps | system.cpu_pct | custom.*
  metric_value NUMERIC,
  metric_unit  TEXT,                    -- dBm, bps, %, s, etc.
  label        TEXT,                    -- contexto legible: "PON Port 1", "ONU HWTC123"
  source       TEXT         DEFAULT 'manual',  -- manual | agent | api
  ts           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mon_metrics_device_ts ON monitoring_metrics(device_id, ts DESC);
CREATE INDEX IF NOT EXISTS mon_metrics_tenant_key ON monitoring_metrics(tenant_id, metric_key);

ALTER TABLE monitoring_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mon_metrics_tenant_rls" ON monitoring_metrics
  USING (tenant_id IN (
    SELECT t.id FROM tenants t WHERE t.id = monitoring_metrics.tenant_id
      AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() OR up.admin_id = auth.uid())
  ));

-- ── Alertas ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT         NOT NULL,
  device_id        UUID         REFERENCES monitoring_devices(id) ON DELETE CASCADE,
  customer_id      UUID         REFERENCES customers(id)          ON DELETE SET NULL,
  severity         TEXT         NOT NULL CHECK (severity IN ('critical','warning','info')),
  metric_key       TEXT,
  message          TEXT         NOT NULL,
  status           TEXT         NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_by  TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mon_alerts_tenant_status ON monitoring_alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS mon_alerts_device ON monitoring_alerts(device_id);

ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mon_alerts_tenant_rls" ON monitoring_alerts
  USING (tenant_id IN (
    SELECT t.id FROM tenants t WHERE t.id = monitoring_alerts.tenant_id
      AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() OR up.admin_id = auth.uid())
  ));

-- ── Limpieza automática de métricas > 90 días (requiere pg_cron habilitado) ────
-- SELECT cron.schedule('cleanup-old-metrics', '0 3 * * *',
--   $$DELETE FROM monitoring_metrics WHERE ts < NOW() - INTERVAL '90 days'$$);

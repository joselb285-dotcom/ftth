-- =============================================================================
-- FTTH GIS — Schema completo (Railway Postgres, reemplazo de Supabase)
-- Idempotente: seguro re-ejecutar.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Tenants ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug  text NOT NULL UNIQUE,
  name  text NOT NULL DEFAULT ''
);

-- ── Usuarios (reemplaza auth.users + user_profiles) ──────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name     text,
  role          text NOT NULL DEFAULT 'user'
                CHECK (role IN ('superadmin','admin','user','tecnico')),
  admin_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users(lower(email));

-- ── Membresía usuario ↔ tenant ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tenants (
  user_id   uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'user',
  PRIMARY KEY (user_id, tenant_id)
);

-- ── Proyectos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  name        text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  created_at  timestamptz,
  updated_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id  ON projects(owner_id);

CREATE TABLE IF NOT EXISTS sub_projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  created_at       timestamptz,
  updated_at       timestamptz,
  location_lat     float8,
  location_lng     float8,
  location_display text,
  zabbix_olt_hosts text[],
  change_log       jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_sub_projects_project ON sub_projects(project_id);

CREATE TABLE IF NOT EXISTS features (
  id             uuid PRIMARY KEY,
  sub_project_id uuid NOT NULL REFERENCES sub_projects(id) ON DELETE CASCADE,
  geometry       jsonb NOT NULL DEFAULT '{}'::jsonb,
  properties     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_features_sub_project ON features(sub_project_id);

-- ── Clientes / abonados ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES projects(id)     ON DELETE SET NULL,
  sub_project_id   uuid REFERENCES sub_projects(id) ON DELETE SET NULL,
  feature_id       text,
  name             text NOT NULL,
  document_type    text CHECK (document_type IN ('DNI','CUIT','CUIL','passport','other')),
  document_number  text,
  address          text,
  phone            text,
  email            text,
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','suspended','cancelled')),
  service_type     text CHECK (service_type IN ('residential','business','enterprise')),
  plan_name        text,
  plan_down_mbps   integer,
  plan_up_mbps     integer,
  monthly_fee      numeric(10,2),
  install_date     date,
  cancel_date      date,
  cancel_reason    text,
  onu_model        text,
  onu_serial       text,
  onu_mac          text,
  olt_host         text,
  pon_port         integer,
  optical_distance_m integer,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS customers_status_idx ON customers(tenant_id, status);

-- ── Monitoreo / NMS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitoring_devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             text NOT NULL,
  type             text NOT NULL CHECK (type IN ('olt','switch','router','onu','mikrotik','other')),
  vendor           text,
  model            text,
  ip_address       text,
  snmp_community   text DEFAULT 'public',
  snmp_version     text DEFAULT '2c',
  api_url          text,
  api_username     text,
  api_password     text,
  api_token        text,
  poll_interval_s  integer DEFAULT 300,
  protocol         text NOT NULL DEFAULT 'manual' CHECK (protocol IN ('snmp','http','manual')),
  alert_rules      jsonb DEFAULT '[]'::jsonb,
  status           text NOT NULL DEFAULT 'unknown'
                   CHECK (status IN ('online','offline','degraded','unknown')),
  last_seen_at     timestamptz,
  feature_id       text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mon_devices_tenant_idx ON monitoring_devices(tenant_id);

CREATE TABLE IF NOT EXISTS monitoring_metrics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    uuid NOT NULL REFERENCES monitoring_devices(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_key   text NOT NULL,
  metric_value numeric,
  metric_unit  text,
  label        text,
  source       text DEFAULT 'manual',
  ts           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mon_metrics_device_ts  ON monitoring_metrics(device_id, ts DESC);
CREATE INDEX IF NOT EXISTS mon_metrics_tenant_key ON monitoring_metrics(tenant_id, metric_key);

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id        uuid REFERENCES monitoring_devices(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES customers(id)          ON DELETE SET NULL,
  severity         text NOT NULL CHECK (severity IN ('critical','warning','info')),
  metric_key       text,
  message          text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_by  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);
CREATE INDEX IF NOT EXISTS mon_alerts_tenant_status ON monitoring_alerts(tenant_id, status);

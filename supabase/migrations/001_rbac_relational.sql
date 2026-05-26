-- =============================================================================
-- Migración 001: Schema relacional + RBAC por rol
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ─── 1. Columnas en projects ──────────────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS name        text        NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text        NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at  timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at  timestamptz;

-- Poblar desde el JSON blob existente
UPDATE projects SET
  name        = COALESCE(data->>'name',        ''),
  description = COALESCE(data->>'description', ''),
  created_at  = (data->>'createdAt')::timestamptz,
  updated_at  = (data->>'updatedAt')::timestamptz
WHERE data IS NOT NULL
  AND (name = '' OR name IS NULL);

-- ─── 2. Tabla sub_projects ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_projects (
  id               text        PRIMARY KEY,
  project_id       text        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             text        NOT NULL DEFAULT '',
  description      text        NOT NULL DEFAULT '',
  created_at       timestamptz,
  updated_at       timestamptz,
  location_lat     float8,
  location_lng     float8,
  location_display text,
  zabbix_olt_hosts text[]
);

-- ─── 3. Tabla features ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS features (
  id             text    PRIMARY KEY,
  sub_project_id text    NOT NULL REFERENCES sub_projects(id) ON DELETE CASCADE,
  geometry       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  properties     jsonb   NOT NULL DEFAULT '{}'::jsonb
);

-- ─── 4. Migración de datos desde projects.data ───────────────────────────────
-- sub_projects
INSERT INTO sub_projects (
  id, project_id, name, description, created_at, updated_at,
  location_lat, location_lng, location_display, zabbix_olt_hosts
)
SELECT
  sp->>'id',
  p.id,
  COALESCE(sp->>'name', ''),
  COALESCE(sp->>'description', ''),
  (sp->>'createdAt')::timestamptz,
  (sp->>'updatedAt')::timestamptz,
  (sp->'location'->>'lat')::float8,
  (sp->'location'->>'lng')::float8,
  sp->'location'->>'displayName',
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(sp->'zabbixOltHosts', '[]'::jsonb)))
FROM projects p,
  jsonb_array_elements(COALESCE(p.data->'subProjects', '[]'::jsonb)) AS sp
WHERE sp->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- features
INSERT INTO features (id, sub_project_id, geometry, properties)
SELECT
  f->'properties'->>'id',
  sp->>'id',
  f->'geometry',
  f->'properties'
FROM projects p,
  jsonb_array_elements(COALESCE(p.data->'subProjects', '[]'::jsonb)) AS sp,
  jsonb_array_elements(COALESCE(sp->'features', '[]'::jsonb)) AS f
WHERE f->'properties'->>'id' IS NOT NULL
  AND sp->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ─── 5. Índices de performance ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id     ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id      ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_sub_projects_project   ON sub_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_features_sub_project   ON features(sub_project_id);

-- ─── 6. RLS en projects ──────────────────────────────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_projects_all"   ON projects;
DROP POLICY IF EXISTS "admin_projects_all"         ON projects;
DROP POLICY IF EXISTS "user_projects_select"       ON projects;

-- superadmin: acceso total
CREATE POLICY "superadmin_projects_all" ON projects
  FOR ALL TO authenticated
  USING  ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'superadmin')
  WITH CHECK ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'superadmin');

-- admin: solo sus propios proyectos
CREATE POLICY "admin_projects_all" ON projects
  FOR ALL TO authenticated
  USING  (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
    AND owner_id = auth.uid()
  )
  WITH CHECK (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
    AND owner_id = auth.uid()
  );

-- user: solo lectura de proyectos de su admin
CREATE POLICY "user_projects_select" ON projects
  FOR SELECT TO authenticated
  USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'user'
    AND owner_id = (SELECT admin_id FROM user_profiles WHERE id = auth.uid())
  );

-- ─── 7. RLS en sub_projects ──────────────────────────────────────────────────
ALTER TABLE sub_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_sub_projects_all"   ON sub_projects;
DROP POLICY IF EXISTS "admin_sub_projects_all"         ON sub_projects;
DROP POLICY IF EXISTS "user_sub_projects_select"       ON sub_projects;

CREATE POLICY "superadmin_sub_projects_all" ON sub_projects
  FOR ALL TO authenticated
  USING  ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'superadmin')
  WITH CHECK ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "admin_sub_projects_all" ON sub_projects
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = sub_projects.project_id
        AND p.owner_id = auth.uid()
        AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = sub_projects.project_id
        AND p.owner_id = auth.uid()
        AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
    )
  );

CREATE POLICY "user_sub_projects_select" ON sub_projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = sub_projects.project_id
        AND p.owner_id = (SELECT admin_id FROM user_profiles WHERE id = auth.uid())
        AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'user'
    )
  );

-- ─── 8. RLS en features ──────────────────────────────────────────────────────
ALTER TABLE features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_features_all"   ON features;
DROP POLICY IF EXISTS "admin_features_all"         ON features;
DROP POLICY IF EXISTS "user_features_select"       ON features;

CREATE POLICY "superadmin_features_all" ON features
  FOR ALL TO authenticated
  USING  ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'superadmin')
  WITH CHECK ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'superadmin');

CREATE POLICY "admin_features_all" ON features
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sub_projects sp
      JOIN projects p ON p.id = sp.project_id
      WHERE sp.id = features.sub_project_id
        AND p.owner_id = auth.uid()
        AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sub_projects sp
      JOIN projects p ON p.id = sp.project_id
      WHERE sp.id = features.sub_project_id
        AND p.owner_id = auth.uid()
        AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
    )
  );

CREATE POLICY "user_features_select" ON features
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sub_projects sp
      JOIN projects p ON p.id = sp.project_id
      WHERE sp.id = features.sub_project_id
        AND p.owner_id = (SELECT admin_id FROM user_profiles WHERE id = auth.uid())
        AND (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'user'
    )
  );

-- ─── 9. Conservar projects.data como backup (descomentar para eliminar) ───────
-- ALTER TABLE projects DROP COLUMN data;

-- =============================================================================
-- Verificación post-migración:
--   SELECT count(*) FROM sub_projects;
--   SELECT count(*) FROM features;
-- =============================================================================

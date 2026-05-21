-- ============================================================
-- MIGRACIÓN SEGURA: Sistema de roles jerárquico
-- Roles: superadmin > admin > user
--
-- INSTRUCCIONES:
--   1. Ejecutar migration_precheck.sql primero y revisar resultados
--   2. Ejecutar este script completo en Supabase SQL Editor
--   3. Todo está dentro de una transacción: si falla, nada cambia
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1: Columnas nuevas en user_profiles
-- (ADD COLUMN IF NOT EXISTS es idempotente — seguro re-ejecutar)
-- ============================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('superadmin', 'admin', 'user'));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS admin_id uuid
  REFERENCES user_profiles(id) ON DELETE SET NULL;

-- ============================================================
-- PASO 2: Migrar datos existentes SIN borrar nada
-- ============================================================

-- Los superadmins actuales (is_superadmin = true) pasan a role = 'superadmin'
UPDATE user_profiles
  SET role = 'superadmin'
  WHERE is_superadmin = true AND role = 'user';

-- Proyectos con owner_id NULL: asignarlos al primer superadmin existente
-- Así no quedan huérfanos cuando se active RLS
UPDATE projects
  SET owner_id = (
    SELECT id FROM user_profiles
    WHERE role = 'superadmin'
    ORDER BY email
    LIMIT 1
  )
  WHERE owner_id IS NULL;

-- Garantizar que TODOS los usuarios existentes tengan acceso
-- al menos a un tenant (preserva el acceso actual).
-- Si un usuario no estaba en user_tenants, se le agrega a todos los tenants.
INSERT INTO user_tenants (user_id, tenant_id, role)
SELECT
  up.id,
  t.id,
  CASE WHEN up.role = 'superadmin' THEN 'admin' ELSE 'user' END
FROM user_profiles up
CROSS JOIN tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM user_tenants ut
  WHERE ut.user_id = up.id AND ut.tenant_id = t.id
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PASO 3: Función auxiliar (evita recursión infinita en RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM user_profiles WHERE id = auth.uid()),
    'user'
  )
$$;

-- ============================================================
-- PASO 4: RLS en user_profiles
-- ============================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_all_profiles"   ON user_profiles;
DROP POLICY IF EXISTS "admin_view_own_users"       ON user_profiles;
DROP POLICY IF EXISTS "admin_update_own_users"     ON user_profiles;
DROP POLICY IF EXISTS "user_view_self"             ON user_profiles;
DROP POLICY IF EXISTS "user_update_self"           ON user_profiles;

-- Superadmin: acceso total
CREATE POLICY "superadmin_all_profiles" ON user_profiles
  FOR ALL
  USING  (get_my_role() = 'superadmin')
  WITH CHECK (get_my_role() = 'superadmin');

-- Admin: ver su propio perfil + los usuarios bajo su gestión
CREATE POLICY "admin_view_own_users" ON user_profiles
  FOR SELECT
  USING (id = auth.uid() OR admin_id = auth.uid());

-- Admin: actualizar datos de sus usuarios
CREATE POLICY "admin_update_own_users" ON user_profiles
  FOR UPDATE
  USING  (admin_id = auth.uid())
  WITH CHECK (admin_id = auth.uid());

-- Cualquier usuario: ver y actualizar su propio perfil
CREATE POLICY "user_view_self" ON user_profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "user_update_self" ON user_profiles
  FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- PASO 5: RLS en user_tenants
-- ============================================================

ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_all_user_tenants"  ON user_tenants;
DROP POLICY IF EXISTS "admin_manage_user_tenants"    ON user_tenants;
DROP POLICY IF EXISTS "user_view_own_tenants"        ON user_tenants;

-- Superadmin: acceso total
CREATE POLICY "superadmin_all_user_tenants" ON user_tenants
  FOR ALL
  USING (get_my_role() = 'superadmin');

-- Admin: gestionar sus propios tenant memberships + los de sus usuarios
CREATE POLICY "admin_manage_user_tenants" ON user_tenants
  FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = user_tenants.user_id
        AND admin_id = auth.uid()
    )
  );

-- Usuario: solo ver sus propias membresías
CREATE POLICY "user_view_own_tenants" ON user_tenants
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- PASO 6: RLS en projects
--
-- SELECT: mantiene el comportamiento actual (acceso por tenant).
--   Cualquier usuario miembro del tenant ve todos los proyectos
--   del tenant — igual que antes de la migración.
--
-- WRITE (INSERT/UPDATE/DELETE): solo el propietario, su admin
--   o el superadmin pueden modificar.
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_all_projects"         ON projects;
DROP POLICY IF EXISTS "select_projects_by_tenant"       ON projects;
DROP POLICY IF EXISTS "write_projects_owner_or_admin"   ON projects;

-- Superadmin: acceso total
CREATE POLICY "superadmin_all_projects" ON projects
  FOR ALL
  USING  (get_my_role() = 'superadmin')
  WITH CHECK (get_my_role() = 'superadmin');

-- SELECT: miembro del tenant O dueño del proyecto
-- Esto preserva exactamente el comportamiento actual.
CREATE POLICY "select_projects_by_tenant" ON projects
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_tenants
      WHERE user_tenants.tenant_id = projects.tenant_id
        AND user_tenants.user_id   = auth.uid()
    )
  );

-- INSERT: cualquier usuario autenticado (guarda con su owner_id)
CREATE POLICY "insert_own_projects" ON projects
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- UPDATE: dueño o admin del dueño
CREATE POLICY "update_projects_owner_or_admin" ON projects
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = projects.owner_id
        AND admin_id = auth.uid()
    )
  );

-- DELETE: dueño o admin del dueño
CREATE POLICY "delete_projects_owner_or_admin" ON projects
  FOR DELETE
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = projects.owner_id
        AND admin_id = auth.uid()
    )
  );

COMMIT;

-- ============================================================
-- VERIFICACIÓN POST-MIGRACIÓN (ejecutar aparte para confirmar)
-- ============================================================
-- SELECT id, email, role, admin_id FROM user_profiles ORDER BY role, email;
-- SELECT COUNT(*) AS proyectos_sin_owner FROM projects WHERE owner_id IS NULL;
-- SELECT COUNT(*) AS usuarios_sin_tenant FROM user_profiles up
--   WHERE NOT EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = up.id);

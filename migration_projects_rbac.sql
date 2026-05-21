-- ============================================================
-- MIGRACIÓN: Restricción de acceso a proyectos por scope de rol
--
-- PROBLEMA: "select_projects_by_tenant" permite que cualquier
--   miembro del tenant vea TODOS los proyectos (admins veían
--   proyectos de otros admins y usuarios).
--
-- SOLUCIÓN: Reemplazar por política basada en ownership:
--   - Superadmin : todos los proyectos (policy existente cubre esto)
--   - Admin      : sus propios proyectos + los de sus usuarios (admin_id)
--   - User       : solo sus propios proyectos
--
-- EJECUCIÓN: Supabase SQL Editor → Ejecutar este script completo.
-- ============================================================

BEGIN;

-- ── 1. Eliminar política permisiva anterior ───────────────────────────────────
DROP POLICY IF EXISTS "select_projects_by_tenant" ON projects;

-- ── 2. Nueva política: SELECT restringido por scope de propietario ────────────
--   • Superadmin ya está cubierto por "superadmin_all_projects" (FOR ALL).
--   • Admin ve: sus proyectos propios + proyectos de sus usuarios (admin_id = uid).
--   • User ve: solo sus propios proyectos.
CREATE POLICY "select_projects_by_scope" ON projects
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (
      get_my_role() = 'admin'
      AND EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id       = projects.owner_id
          AND admin_id = auth.uid()
      )
    )
  );

-- ── 3. También añadir owner_id al INSERT si no está seteado ──────────────────
--   (ya existe "insert_own_projects" pero verificamos que no haya conflicto)
DROP POLICY IF EXISTS "insert_own_projects" ON projects;
CREATE POLICY "insert_own_projects" ON projects
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- ── 4. Proyectos huérfanos: asignar al primer superadmin ─────────────────────
--   Garantiza que ningún proyecto quede inaccesible por owner_id NULL.
UPDATE projects
  SET owner_id = (
    SELECT id FROM user_profiles
    WHERE role = 'superadmin'
    ORDER BY email
    LIMIT 1
  )
WHERE owner_id IS NULL;

COMMIT;

-- ============================================================
-- VERIFICACIÓN (ejecutar aparte):
-- ============================================================
-- Ver proyectos y sus dueños:
--   SELECT p.id, p.owner_id, up.email, up.role, up.admin_id
--   FROM projects p
--   LEFT JOIN user_profiles up ON up.id = p.owner_id
--   ORDER BY up.role, up.email;
--
-- Proyectos sin owner (deben ser 0 tras la migración):
--   SELECT COUNT(*) FROM projects WHERE owner_id IS NULL;

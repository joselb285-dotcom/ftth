-- ============================================================
-- PRE-CHECK: Ejecutar ANTES de migration_roles.sql
-- Te muestra el estado actual de la base de datos para
-- que no haya sorpresas al correr la migración.
-- ============================================================

-- Resumen general
SELECT 'Total usuarios'            AS descripcion, COUNT(*)::text AS valor FROM user_profiles
UNION ALL
SELECT 'Superadmins actuales',      COUNT(*)::text FROM user_profiles WHERE is_superadmin = true
UNION ALL
SELECT 'Total proyectos',           COUNT(*)::text FROM projects
UNION ALL
SELECT 'Proyectos sin owner_id',    COUNT(*)::text FROM projects WHERE owner_id IS NULL
UNION ALL
SELECT 'Total tenants',             COUNT(*)::text FROM tenants
UNION ALL
SELECT 'Entradas en user_tenants',  COUNT(*)::text FROM user_tenants;

-- ── Usuarios existentes ──────────────────────────────────────
SELECT
  up.id,
  up.email,
  up.full_name,
  up.is_superadmin,
  (SELECT COUNT(*) FROM user_tenants ut WHERE ut.user_id = up.id) AS tenants_asignados,
  (SELECT COUNT(*) FROM projects p WHERE p.owner_id = up.id)      AS proyectos_propios
FROM user_profiles up
ORDER BY up.is_superadmin DESC, up.email;

-- ── Proyectos con owner_id NULL (riesgo) ─────────────────────
SELECT id, tenant_id, owner_id, (data->>'name') AS nombre
FROM projects
WHERE owner_id IS NULL;

-- ── Usuarios SIN ningún tenant asignado ──────────────────────
SELECT up.id, up.email, up.full_name
FROM user_profiles up
WHERE NOT EXISTS (
  SELECT 1 FROM user_tenants ut WHERE ut.user_id = up.id
);

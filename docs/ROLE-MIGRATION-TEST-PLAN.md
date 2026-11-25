# Administrator Role Migration and Local Test Plan

## Important

Apply these changes to the LOCAL `cspc_spacehub` database first. Do not run them
against Render or any production database until local verification is complete.
Take a database backup before applying either migration.

## Migration order

Run these files once, in this order, using the local MariaDB client:

1. `database/migrations/20261125_system_admin_role.sql`
2. `database/migrations/20261126_college_admin_roles.sql`

The second migration converts every existing legacy `admin` account with a non-null
`college_id` into `college_admin`. Any remaining `admin` rows have no college assignment
and are intentionally not promoted. Review those rows before deciding what to do with
them. The legacy enum value is retained temporarily for compatibility and review.

## Verify the migration

Run these read-only queries locally:

```sql
SHOW COLUMNS FROM users LIKE 'role';
SELECT role, status, college_id, COUNT(*) AS account_count
FROM users
GROUP BY role, status, college_id
ORDER BY role, college_id;
SELECT u.id, u.school_id, u.full_name, u.role, u.status, u.college_id, c.code
FROM users u LEFT JOIN colleges c ON c.id = u.college_id
WHERE u.role IN ('admin', 'college_admin', 'system_admin')
ORDER BY u.role, c.code;
SELECT code, name FROM colleges ORDER BY code;
```

Expected: the five existing assigned college administrators are `college_admin`, each
with exactly one of CCS, CEA, CAS, CTHBM, or CHS. Existing System Administrator
account(s), if already bootstrapped, must be `system_admin` with `college_id` NULL.
Investigate any remaining `admin` rows before proceeding.

## Local application checks

1. Start the local app and sign in as the System Administrator.
2. Open `/system-admin`; verify the five colleges and their assigned administrators.
3. Verify create is available only for a college with no College Administrator account.
4. Verify profile update, reassignment to an unoccupied college, deactivate/reactivate,
   and temporary password reset. Copy each generated password immediately; it is shown once.
5. Verify a newly created or reset College Administrator must change the temporary
   password before accessing any other page.
6. Sign in as each College Administrator and verify all admin pages and calendar data
   remain restricted to that administrator's assigned college.
7. Verify College Administrators cannot access `/system-admin` or create/manage any
   administrator account. Verify public registration cannot create either admin role.
8. Verify reservation notifications go only to the active College Administrator of
   the facility's college.
9. Verify audit entries exist for create, update, deactivate/reactivate, and reset.

Do not deploy until these checks pass.

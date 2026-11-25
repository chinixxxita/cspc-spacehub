# First System Administrator bootstrap

This project starts from the original CSPC SpaceHub source. The first System Administrator is provisioned with a one-time interactive developer command; public registration cannot create this role.

## Local-only first run

1. Back up the local database.
2. Apply `database/migrations/20261125_system_admin_role.sql` to the existing database using a database owner account.
3. Ensure the `must_change_password` column exists (apply `20261123_must_change_password.sql` if it does not).
4. Run `npm run create-system-admin` in an interactive terminal.
5. Type `CREATE SYSTEM ADMIN`, then enter the requested account details. The password prompt is hidden.
6. The command refuses to run if any `system_admin` already exists. It uses a MySQL advisory lock to prevent concurrent bootstrap attempts.
7. The new account is marked `must_change_password = TRUE`; login sends it to the password-change page.
8. The audit entry records the bootstrap event and account ID only. It never records the password or password hash.

Do not run this against the Render database yet. First test the migration and bootstrap against a local copy of the database.

## Notes

- The legacy `create-admin` and `create-college-admin` scripts are disabled when `NODE_ENV=production`.
- College administrators can no longer use `/admin/admin-accounts` to create other administrators.
- The System Administrator landing page is `/system-admin`.
- The full website-based college-admin creation form is the next implementation phase; this initial change only provisions the first System Administrator safely.


## College Administrator provisioning

After applying `database/migrations/20261126_college_admin_roles.sql`, sign in as the
System Administrator and use `/system-admin` to create one College Administrator
for each college. The dashboard supports profile updates, reassignment to an unoccupied
college, deactivation/reactivation, and temporary password resets. All changes are
audit logged. Temporary passwords are shown once and require a change at next login.
College Administrators cannot manage administrator accounts.

-- Run as the provider's admin user, AFTER deploy-setup.sql.
-- Replace <DB_NAME> and the password. '%' is used because the app host's IP is not fixed.
CREATE USER IF NOT EXISTS 'spacehub_app'@'%' IDENTIFIED BY 'CHANGE_THIS_TO_A_LONG_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON `<DB_NAME>`.* TO 'spacehub_app'@'%';

-- Admin password reset: forces a user to choose a new password after a reset.
-- For an EXISTING database. Run once (a second run errors with "Duplicate column name").
-- Fresh databases get this column from schema.sql / deploy-setup.sql.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

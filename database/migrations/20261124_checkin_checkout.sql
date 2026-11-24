-- Check-in / check-out tracking for approved reservations.
-- For an EXISTING database. Run once (a second run errors with "Duplicate column name").
-- Fresh databases get these columns from schema.sql / deploy-setup.sql.
ALTER TABLE reservations
  ADD COLUMN checked_in_at DATETIME NULL,
  ADD COLUMN checked_out_at DATETIME NULL;

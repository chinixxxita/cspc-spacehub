-- QR check-in: one secret token per facility. For an EXISTING database. Run once.
-- The app fills in the tokens automatically the next time it starts
-- (and whenever a facility is added), so no data step is needed here.
ALTER TABLE rooms
  ADD COLUMN checkin_token VARCHAR(64) NULL,
  ADD UNIQUE KEY uq_room_checkin_token (checkin_token);

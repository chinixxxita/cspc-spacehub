-- Initialize sample laboratories for colleges that do not yet have facilities.
-- Run AFTER 20261124_colleges.sql. Safe to re-run: college-scoped names are unique.
-- These are starter/demo records, NOT verified official CSPC facility names.
-- College administrators should rename, update capacity/equipment, or remove them.

INSERT INTO rooms
(college_id, name, type, building, floor, capacity, air_conditioned, has_computers, computer_count, description)
SELECT c.id, seed.name, 'Laboratory', CONCAT(c.code, ' Building'), NULL,
       seed.capacity, seed.air_conditioned, seed.has_computers, seed.computer_count,
       CONCAT('SAMPLE FACILITY — verify the official name, location, capacity, and equipment with ', c.code, ' administration before opening reservations.')
FROM colleges c
CROSS JOIN (
  SELECT 'Computer Laboratory 1' AS name, 30 AS capacity, TRUE AS air_conditioned, TRUE AS has_computers, 30 AS computer_count
  UNION ALL SELECT 'Teaching Laboratory 1', 30, TRUE, FALSE, 0
  UNION ALL SELECT 'Specialized Laboratory 1', 25, TRUE, FALSE, 0
) AS seed
WHERE c.code <> 'CCS'
  AND NOT EXISTS (
    SELECT 1 FROM rooms existing
    WHERE existing.college_id = c.id AND existing.name = seed.name
  );

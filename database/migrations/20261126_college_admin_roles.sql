-- Introduce the distinct College Administrator role while retaining the legacy
-- 'admin' enum value for any unassigned legacy accounts pending manual review.
-- Existing assigned administrators are migrated automatically.
ALTER TABLE users
  MODIFY COLUMN role ENUM('student', 'faculty', 'admin', 'college_admin', 'system_admin')
  NOT NULL DEFAULT 'student';

UPDATE users
SET role = 'college_admin'
WHERE role = 'admin' AND college_id IS NOT NULL;

-- Any remaining role='admin' rows have no college assignment and are deliberately
-- not promoted. Review them before removing the legacy enum value.

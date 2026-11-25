-- Add the distinct campus-wide System Administrator role.
-- Apply once to the existing MySQL database before running create-system-admin.
ALTER TABLE users
  MODIFY COLUMN role ENUM('student', 'faculty', 'admin', 'system_admin')
  NOT NULL DEFAULT 'student';

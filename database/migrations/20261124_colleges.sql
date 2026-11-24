-- Multi-college support (CCS, CTHBM, CAS, CEA, CHS).
-- For an EXISTING database that was running as a CCS-only system. Run ONCE, as the
-- provider's admin user (the app's least-privilege user cannot ALTER tables).
-- Fresh databases get all of this from schema.sql / deploy-setup.sql.
--
-- What it does:
--   * creates the colleges table and the five colleges
--   * adds college_id to users, rooms and audit_logs
--   * assigns EVERYTHING that exists today to CCS (the system was CCS-only), so
--     current admins become the CCS admins and current facilities become CCS facilities
--   * makes facility names unique per college instead of globally ("Room 1" can exist in every college)

CREATE TABLE colleges (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO colleges (code, name) VALUES
('CCS',   'College of Computer Studies'),
('CTHBM', 'College of Tourism, Hospitality and Business Management'),
('CAS',   'College of Arts and Sciences'),
('CEA',   'College of Engineering and Architecture'),
('CHS',   'College of Health Sciences');

-- users
ALTER TABLE users ADD COLUMN college_id INT UNSIGNED NULL;
UPDATE users SET college_id = (SELECT id FROM colleges WHERE code = 'CCS');
ALTER TABLE users
  ADD CONSTRAINT fk_user_college FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE RESTRICT,
  ADD INDEX idx_user_college (college_id, role, status);

-- rooms
ALTER TABLE rooms ADD COLUMN college_id INT UNSIGNED NULL;
UPDATE rooms SET college_id = (SELECT id FROM colleges WHERE code = 'CCS');
ALTER TABLE rooms MODIFY college_id INT UNSIGNED NOT NULL;
ALTER TABLE rooms
  ADD CONSTRAINT fk_room_college FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE RESTRICT,
  DROP INDEX name,
  ADD UNIQUE KEY uq_room_college_name (college_id, name);

-- audit_logs (each entry is tagged with the college whose admins may see it)
ALTER TABLE audit_logs ADD COLUMN college_id INT UNSIGNED NULL;
UPDATE audit_logs SET college_id = (SELECT id FROM colleges WHERE code = 'CCS');
ALTER TABLE audit_logs ADD INDEX idx_audit_college_created (college_id, created_at);

CREATE DATABASE IF NOT EXISTS cspc_spacehub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cspc_spacehub;

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

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(30) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'faculty', 'admin', 'college_admin', 'system_admin') NOT NULL DEFAULT 'student',
  status ENUM('Active', 'Inactive', 'Pending') NOT NULL DEFAULT 'Active',
  terms_accepted_at DATETIME NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  college_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_college FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE RESTRICT,
  INDEX idx_user_college (college_id, role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE rooms (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  college_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  type ENUM('Room', 'Laboratory') NOT NULL,
  building VARCHAR(100) DEFAULT NULL,
  floor VARCHAR(30) DEFAULT NULL,
  capacity INT UNSIGNED NOT NULL,
  air_conditioned BOOLEAN NOT NULL DEFAULT FALSE,
  has_computers BOOLEAN NOT NULL DEFAULT FALSE,
  computer_count INT UNSIGNED NOT NULL DEFAULT 0,
  description TEXT,
  status ENUM('Available', 'Unavailable', 'Maintenance') NOT NULL DEFAULT 'Available',
  checkin_token VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_room_college FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE RESTRICT,
  INDEX idx_room_type_status (type, status),
  UNIQUE KEY uq_room_college_name (college_id, name),
  UNIQUE KEY uq_room_checkin_token (checkin_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_no VARCHAR(50) NOT NULL UNIQUE,
  user_id INT UNSIGNED NOT NULL,
  room_id INT UNSIGNED NOT NULL,
  reservation_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  purpose VARCHAR(100) NOT NULL,
  purpose_details TEXT NOT NULL,
  number_of_users INT UNSIGNED NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed') NOT NULL DEFAULT 'Pending',
  rejection_reason TEXT DEFAULT NULL,
  checked_in_at DATETIME NULL,
  checked_out_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_reservation_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_reservation_room
    FOREIGN KEY (room_id) REFERENCES rooms(id)
    ON DELETE RESTRICT,

  INDEX idx_reservation_room_date (room_id, reservation_date),
  INDEX idx_reservation_user_status (user_id, status),
  INDEX idx_reservation_date_status (reservation_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notification_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,

  INDEX idx_notification_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE facility_maintenance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_maintenance_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_maintenance_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_maintenance_room_dates (room_id, start_date, end_date, status),
  INDEX idx_maintenance_dates (start_date, end_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(64) NULL,
  details TEXT NULL,
  ip_address VARCHAR(64) NULL,
  college_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_college_created (college_id, created_at),
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_user (user_id, created_at),
  INDEX idx_audit_entity (entity_type, entity_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO rooms
(college_id, name, type, building, floor, capacity, air_conditioned, has_computers, computer_count, description)
VALUES
((SELECT id FROM colleges WHERE code = 'CCS'), 'Room 1', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'Room 2', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'Room 3', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'Room 4', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'Room 5', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'Room 6', 'Room', 'CCS Building', NULL, 45, FALSE, FALSE, 0, 'Regular classroom for lectures, meetings, and student activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'Mac Lab', 'Laboratory', 'CCS Building', NULL, 30, TRUE, TRUE, 30, 'Mac computer laboratory for instructor-led classes and technical activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'IT Lab 1', 'Laboratory', 'CCS Building', NULL, 40, TRUE, TRUE, 40, 'Computer laboratory for instructor-led classes and technical activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'IT Lab 2', 'Laboratory', 'CCS Building', NULL, 40, TRUE, TRUE, 40, 'Computer laboratory for instructor-led classes and technical activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'NAS Lab', 'Laboratory', 'CCS Building', NULL, 30, TRUE, TRUE, 30, 'Laboratory for networking, storage, and systems activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'RISE Lab', 'Laboratory', 'CCS Building', NULL, 30, TRUE, TRUE, 30, 'Research and innovation laboratory for technical and project activities.'),
((SELECT id FROM colleges WHERE code = 'CCS'), 'CCS Lab', 'Laboratory', 'CCS Building', NULL, 40, TRUE, TRUE, 40, 'Computer laboratory for instructor-led classes and technical activities.');

-- Starter/sample laboratories for the other colleges. These names and details
-- must be verified and edited by the respective college administrators.
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
WHERE c.code <> 'CCS';
CREATE TABLE IF NOT EXISTS user_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  reservation_updates BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

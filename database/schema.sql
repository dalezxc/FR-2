CREATE DATABASE IF NOT EXISTS rideguard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rideguard;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role ENUM('parent','driver','guard','admin') NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id INT UNSIGNED NOT NULL,
  make VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  plate_number VARCHAR(30) NOT NULL UNIQUE,
  color VARCHAR(50) NULL,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS driver_profiles (
  driver_id INT UNSIGNED PRIMARY KEY,
  safety_score TINYINT UNSIGNED NOT NULL DEFAULT 98,
  rating DECIMAL(2,1) NOT NULL DEFAULT 5.0,
  total_trips INT UNSIGNED NOT NULL DEFAULT 0,
  years_experience TINYINT UNSIGNED NOT NULL DEFAULT 1,
  is_online TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parent_profiles (
  parent_id INT UNSIGNED PRIMARY KEY,
  emergency_contact VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS guard_profiles (
  guard_id INT UNSIGNED PRIMARY KEY,
  school_id INT UNSIGNED NULL,
  assigned_gate VARCHAR(80) NULL,
  FOREIGN KEY (guard_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schools (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  address VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_id INT UNSIGNED NOT NULL,
  school_id INT UNSIGNED NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  age TINYINT UNSIGNED NULL,
  date_of_birth DATE NULL,
  grade_level VARCHAR(50) NULL,
  school_name VARCHAR(160) NOT NULL DEFAULT 'Lincoln Elementary School',
  qr_code VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trips (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  parent_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NULL,
  trip_type ENUM('home_to_school','school_to_home') NOT NULL,
  pickup_address VARCHAR(255) NOT NULL,
  dropoff_address VARCHAR(255) NOT NULL,
  pickup_time TIME NOT NULL,
  scheduled_date DATE NOT NULL,
  is_recurring TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('pending','accepted','qr_verified','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scan_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  guard_id INT UNSIGNED NULL,
  trip_id INT UNSIGNED NULL,
  phase ENUM('home_to_school','school_to_home') NOT NULL,
  result ENUM('verified','rejected') NOT NULL DEFAULT 'verified',
  note VARCHAR(255) NULL,
  scanned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (guard_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gps_tracking (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  speed_kph DECIMAL(6,2) NULL,
  heading DECIMAL(6,2) NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS geofences (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  radius_meters INT UNSIGNED NOT NULL DEFAULT 100,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS geofence_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  geofence_id INT UNSIGNED NOT NULL,
  trip_id INT UNSIGNED NULL,
  student_id INT UNSIGNED NULL,
  event_type ENUM('entered','exited') NOT NULL,
  event_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ai_monitoring (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  event_type ENUM('overspeeding','sudden_braking','sudden_turn','unsafe_behavior') NOT NULL,
  severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
  description VARCHAR(255) NOT NULL,
  suggested_action VARCHAR(255) NULL,
  accelerometer_json JSON NULL,
  gyroscope_json JSON NULL,
  speed_kph DECIMAL(6,2) NULL,
  detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  trip_id INT UNSIGNED NULL,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message VARCHAR(255) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_readiness (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  trip_id INT UNSIGNED NULL,
  guard_id INT UNSIGNED NULL,
  status ENUM('waiting','ready','picked_up') NOT NULL DEFAULT 'waiting',
  marked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  FOREIGN KEY (guard_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS biometric_verifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  method ENUM('face','fingerprint','device_pin') NOT NULL,
  result ENUM('verified','failed','manual_review') NOT NULL,
  verified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ratings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_id INT UNSIGNED NOT NULL,
  parent_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_trip_rating (trip_id),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (score BETWEEN 1 AND 5)
) ENGINE=InnoDB;

INSERT INTO users (id, role, first_name, last_name, email, phone, password_hash) VALUES
  (1, 'parent', 'Demo', 'Parent', 'parent@example.com', '+639171234567', '$2y$10$Utf4DRNGKQSWFeRuT9g8qOvROHRUu9fFaNBGZLaqYzn5n938cvMTm'),
  (2, 'driver', 'Sarah', 'Williams', 'driver@example.com', '+639178765432', '$2y$10$Utf4DRNGKQSWFeRuT9g8qOvROHRUu9fFaNBGZLaqYzn5n938cvMTm'),
  (3, 'driver', 'Michael', 'Chen', 'michael.driver@example.com', '+639177654321', '$2y$10$Utf4DRNGKQSWFeRuT9g8qOvROHRUu9fFaNBGZLaqYzn5n938cvMTm'),
  (4, 'guard', 'Demo', 'Guard', 'guard@example.com', '+639176543210', '$2y$10$Utf4DRNGKQSWFeRuT9g8qOvROHRUu9fFaNBGZLaqYzn5n938cvMTm')
ON DUPLICATE KEY UPDATE email = VALUES(email);

INSERT INTO driver_profiles (driver_id, safety_score, rating, total_trips, years_experience, is_online) VALUES
  (2, 98, 4.9, 324, 5, 1),
  (3, 96, 4.8, 289, 4, 1)
ON DUPLICATE KEY UPDATE is_online = VALUES(is_online);

INSERT INTO vehicles (driver_id, make, model, plate_number, color) VALUES
  (2, 'Honda', 'CR-V', 'ABC-123', 'Blue'),
  (3, 'Toyota', 'Highlander', 'XYZ-789', 'Silver')
ON DUPLICATE KEY UPDATE plate_number = VALUES(plate_number);

INSERT INTO schools (name, address, latitude, longitude) VALUES
  ('Lincoln Elementary School', 'Cebu City', 10.3157000, 123.9054000)
ON DUPLICATE KEY UPDATE address = VALUES(address);

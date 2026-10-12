-- One-time bootstrap: creates the database and an application user.
-- Run as a MySQL admin:   mysql -u root -p < database/setup.sql
-- CHANGE THE PASSWORD below (and put the same one in backend/.env -> MYSQL_PASSWORD).

CREATE DATABASE IF NOT EXISTS returnride
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'returnride'@'localhost' IDENTIFIED BY 'returnride_pass';
CREATE USER IF NOT EXISTS 'returnride'@'127.0.0.1' IDENTIFIED BY 'returnride_pass';
GRANT ALL PRIVILEGES ON returnride.* TO 'returnride'@'localhost';
GRANT ALL PRIVILEGES ON returnride.* TO 'returnride'@'127.0.0.1';
FLUSH PRIVILEGES;

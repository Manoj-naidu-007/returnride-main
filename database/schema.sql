-- ReturnRide MySQL schema (generated from backend/models.py)
-- Target: MySQL 8.0+ (MariaDB 10.5+ also works). Engine InnoDB, charset utf8mb4.
-- You normally do NOT need to run this: the backend creates missing tables on startup.
-- Use it if you prefer to create the schema manually or review it first.
-- Run it on an EMPTY database (the CREATE INDEX lines are not re-runnable).
-- Usage:  mysql -u returnride -p returnride < database/schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
	id BIGINT NOT NULL AUTO_INCREMENT, 
	phone VARCHAR(20) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	`role` VARCHAR(20) NOT NULL, 
	gender VARCHAR(20), 
	status VARCHAR(20) NOT NULL, 
	blocked_reason VARCHAR(255), 
	rating FLOAT NOT NULL, 
	rating_count INTEGER NOT NULL, 
	vehicle_model VARCHAR(100), 
	vehicle_number VARCHAR(30), 
	license_no VARCHAR(50), 
	vehicle_rc_no VARCHAR(50), 
	verified BOOL NOT NULL, 
	wallet_balance NUMERIC(12, 2) NOT NULL, 
	last_login_at DATETIME(6), 
	created_at DATETIME(6) NOT NULL, 
	deleted_at DATETIME(6), 
	PRIMARY KEY (id), 
	UNIQUE (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_users_created_at ON users (created_at);
CREATE INDEX ix_users_role ON users (`role`);
CREATE INDEX ix_users_status ON users (status);

CREATE TABLE IF NOT EXISTS rides (
	id BIGINT NOT NULL AUTO_INCREMENT, 
	driver_id BIGINT NOT NULL, 
	driver_name VARCHAR(120), 
	vehicle_model VARCHAR(100), 
	vehicle_number VARCHAR(30), 
	driver_rating FLOAT NOT NULL, 
	origin JSON NOT NULL, 
	dest JSON NOT NULL, 
	distance_km FLOAT NOT NULL, 
	duration_min FLOAT NOT NULL, 
	route_geometry JSON NOT NULL, 
	depart_start DATETIME(6) NOT NULL, 
	depart_end DATETIME(6) NOT NULL, 
	seats_total INTEGER NOT NULL, 
	seats_available INTEGER NOT NULL, 
	fare_rate FLOAT, 
	women_only BOOL NOT NULL, 
	recurring BOOL NOT NULL, 
	is_return BOOL NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(driver_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_rides_driver_id ON rides (driver_id);
CREATE INDEX ix_rides_status_seats ON rides (status, seats_available);

CREATE TABLE IF NOT EXISTS bookings (
	id BIGINT NOT NULL AUTO_INCREMENT, 
	ride_id BIGINT NOT NULL, 
	driver_id BIGINT NOT NULL, 
	passenger_id BIGINT NOT NULL, 
	driver_name VARCHAR(120), 
	vehicle_model VARCHAR(100), 
	vehicle_number VARCHAR(30), 
	passenger_name VARCHAR(120), 
	passenger_phone VARCHAR(20), 
	pickup_point JSON NOT NULL, 
	drop_point JSON NOT NULL, 
	distance_km FLOAT NOT NULL, 
	duration_min FLOAT NOT NULL, 
	route_geometry JSON NOT NULL, 
	pooled BOOL NOT NULL, 
	is_return BOOL NOT NULL, 
	estimated_fare NUMERIC(10, 2) NOT NULL, 
	fare_breakdown JSON, 
	final_fare NUMERIC(10, 2), 
	actual_distance_km FLOAT, 
	complete_override_reason VARCHAR(255), 
	status VARCHAR(20) NOT NULL, 
	otp VARCHAR(8), 
	otp_hash VARCHAR(64), 
	otp_expires_at DATETIME(6), 
	otp_attempts INTEGER NOT NULL, 
	otp_locked_until DATETIME(6), 
	otp_verified_at DATETIME(6), 
	driver_location JSON, 
	arrived_at DATETIME(6), 
	started_at DATETIME(6), 
	completed_at DATETIME(6), 
	cancelled_at DATETIME(6), 
	cancelled_by VARCHAR(20), 
	cancel_reason VARCHAR(255), 
	payment_mode VARCHAR(20), 
	payment_status VARCHAR(20) NOT NULL, 
	paid_at DATETIME(6), 
	rating INTEGER, 
	rating_comment TEXT, 
	co2_saved FLOAT, 
	created_at DATETIME(6) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(ride_id) REFERENCES rides (id), 
	FOREIGN KEY(driver_id) REFERENCES users (id), 
	FOREIGN KEY(passenger_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_bookings_created_at ON bookings (created_at);
CREATE INDEX ix_bookings_driver_status ON bookings (driver_id, status);
CREATE INDEX ix_bookings_passenger_status ON bookings (passenger_id, status);
CREATE INDEX ix_bookings_ride_id ON bookings (ride_id);
CREATE INDEX ix_bookings_status ON bookings (status);

CREATE TABLE IF NOT EXISTS booking_events (
	id BIGINT NOT NULL AUTO_INCREMENT, 
	booking_id BIGINT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	actor_id BIGINT, 
	created_at DATETIME(6) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(booking_id) REFERENCES bookings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_booking_events_booking_id ON booking_events (booking_id);

CREATE TABLE IF NOT EXISTS audit_logs (
	id BIGINT NOT NULL AUTO_INCREMENT, 
	created_at DATETIME(6) NOT NULL, 
	actor_id BIGINT, 
	actor_role VARCHAR(20), 
	action VARCHAR(80) NOT NULL, 
	entity_type VARCHAR(40), 
	entity_id VARCHAR(64), 
	ip VARCHAR(64), 
	user_agent VARCHAR(512), 
	metadata JSON, 
	level VARCHAR(10) NOT NULL, 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_audit_logs_action ON audit_logs (action);
CREATE INDEX ix_audit_logs_actor_id ON audit_logs (actor_id);
CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX ix_audit_logs_level ON audit_logs (level);

CREATE TABLE IF NOT EXISTS app_settings (
	id VARCHAR(20) NOT NULL, 
	base_fare FLOAT NOT NULL, 
	rate_per_km FLOAT NOT NULL, 
	return_discount FLOAT NOT NULL, 
	pool_discount FLOAT NOT NULL, 
	corridor_km FLOAT NOT NULL, 
	co2_per_km FLOAT NOT NULL, 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS villages (
	id BIGINT NOT NULL AUTO_INCREMENT, 
	name VARCHAR(120) NOT NULL, 
	type VARCHAR(40), 
	lat FLOAT NOT NULL, 
	lng FLOAT NOT NULL, 
	address VARCHAR(255), 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SET FOREIGN_KEY_CHECKS = 1;

# ReturnRide — Product Requirements & Progress

## Original problem statement
Upgrade ReturnRide (rural return-trip ride matching) into a real Ola/Uber/Rapido-style booking
system: real OSM maps + real pickup/drop selection, corridor-based matching, start-ride OTP,
fare screen at completion, payments, ratings, live tracking, and a full admin dashboard with
audit logs. (Data layer: now MySQL via SQLAlchemy async; originally built on MongoDB —
see SETUP.md. All other requirements kept.)

## Architecture
- Backend: FastAPI + MySQL (SQLAlchemy 2 async + aiomysql). Modules: db, utils, audit, auth, maps, rides,
  bookings, admin, seed, server. All routes under `/api`. JWT (phone+password), roles
  passenger/driver/admin. Free maps via OSRM + Nominatim proxies (cached, fallback).
- Frontend: Expo + expo-router + react-query. Shared `RouteMap` (react-leaflet on web,
  react-native-maps + OSM UrlTile on native). Earthy theme in `src/theme.ts`. Reusable UI in
  `src/components/ui.tsx`. Toasts (no Alerts).

## Personas
- Rural passenger: books a return-trip seat by picking landmarks/points on a map.
- Driver: publishes their return route, accepts riders along the corridor, verifies OTP to start.
- Admin: monitors rides, revenue, and an append-only audit log.

## Core requirements (static)
- Real maps everywhere (web + native), real road route/distance/ETA.
- Map-based pickup/drop picker with search + landmark quick-picks.
- Corridor matching on the driver's route polyline (pickup before drop, within corridor km).
- 4-digit start-ride OTP, passenger-only, hashed; 5 attempts then 10-min lock; only path to start.
- Completion fare + breakdown (base + distance − return 25% − pool 12%), CO₂ saved.
- Payments (cash/upi/wallet/razorpay-demo), star ratings.
- Admin KPIs, live rides, audit logs, CSV export, fare settings; non-admin → 403.

## Implemented (2026-06)
- ✅ Auth: register/login (JSON phone+password), blocked check (403), role dependencies, seed admin/drivers/passenger.
- ✅ Maps backend: /maps/search, /maps/reverse, /maps/route (OSRM+Nominatim, cache, fallback), /fare/quote, /villages.
- ✅ Location Picker (draggable center-pin, search autocomplete, landmark chips, current location) + route/fare preview.
- ✅ Rides: publish with real route, corridor matching with scoring + return discount, /rides/mine.
- ✅ Bookings: create (estimated fare + OTP), status lifecycle, /start (OTP), /complete (final fare), /otp/regenerate, /location, /pay, /rate, /incoming, /mine.
- ✅ Full lifecycle UI: passenger OTP display + tracking, driver accept→en_route→arrived→OTP start→complete, live location simulation along route, Open-in-Google-Maps, cancel-with-reason.
- ✅ Trip Summary / Fare screen (passenger) + Earnings (driver) + pay + rate.
- ✅ Admin backend APIs (stats, users PATCH/DELETE, bookings + detail/timeline, force-cancel, live, logs + CSV export, settings) + audit logging across actions.
- ✅ Admin overview screen (KPIs, live rides, audit log stream, logout).
- ✅ Tested: backend pytest 27/27, frontend E2E 100%.

## Backlog / next
- P1: Live charts polish (donut/line) with a charting lib; per-day revenue chart on overview.
- P1: Razorpay live payment wiring (keys provided by user) + wallet top-up.
- P1: Scheduled/recurring ride management UI for drivers.
- P2: Real driver GPS streaming (replace simulation) on native; push notifications (on request); custom fonts (Nunito/Plus Jakarta) via bundled ttf.

## Implemented — iteration 2 (2026-06)
- ✅ Ride Pooling: `/rides/match` returns `estimated_fare_pooled`, `pooled_savings`, `co_riders`; matches screen has a "Share ride & save" toggle that shows the discounted fare + savings badge and books a pooled ride (12% off, reflected in `fare_breakdown.pool_discount`). Backend 15/15 tests pass.
- ✅ Full Admin Console (web-first responsive: sidebar ≥900px, tab row on mobile) via `AdminShell`:
  - Overview: KPI cards, users/drivers/active meta, bookings-per-day bar chart, status-split bar + legend, live rides.
  - Users: search + role/status filters + management modal (block/unblock with reason, verify, role change, reset password, soft-delete). Verified: block → new-login 403 → unblock restores.
  - Drivers: verified filter, vehicle/KYC/earnings, verify toggle.
  - Bookings: status filters + detail drawer (route map, fare breakdown, status timeline, OTP result badge, force-cancel with reason).
  - Logs: level + action filters, live-tail toggle, JSON detail, CSV export.
  - Settings: edit fare constants (base, rate/km, return %, pool %, corridor km, CO₂/km) persisted to DB and used by the backend.

# ReturnRide — Setup Guide (MySQL edition)

Stack: **FastAPI** (Python 3.11+) · **MySQL 8** via SQLAlchemy 2 (async) + aiomysql · **Expo / React Native** (Android, iOS, Web).
The project was converted from MongoDB to MySQL; the HTTP API (routes, JSON shapes, auth) is unchanged, so the frontend needed no code changes.

---

## 0. What you need installed

| Tool | Version | Check |
|------|---------|-------|
| Python | 3.11 or newer | `python --version` |
| Node.js | 20 or newer (22 tested) | `node -v` |
| MySQL | 8.0+ (MariaDB 10.5+ also works) **or** Docker | `mysql --version` / `docker -v` |
| Expo Go app *(optional)* | latest | to run on a physical phone |

---

## 1. Database

Pick **one** option.

### Option A — Docker (easiest)

```bash
# from the project root
docker compose up -d
docker compose ps            # wait until mysql shows "healthy"
```
This uses the root `.env` (database `returnride`, user `returnride`, password `returnride_pass`).

### Option B — MySQL installed on your machine

1. Install MySQL 8 (Windows: MySQL Installer · macOS: `brew install mysql && brew services start mysql` · Ubuntu: `sudo apt install mysql-server`).
2. Create the database and user (edit the password in `database/setup.sql` first):
   ```bash
   mysql -u root -p < database/setup.sql
   ```

### Tables
You do **not** need to create tables. The backend creates any missing tables on startup and seeds demo data.
If you prefer to create them yourself: `mysql -u returnride -p returnride < database/schema.sql` (empty database only).

---

## 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### `backend/.env`
A working `backend/.env` is included for local development (the matching template is `backend/.env.example`). If you start from the template: `cp .env.example .env` and edit.

| Variable | Meaning |
|----------|---------|
| `MYSQL_HOST`, `MYSQL_PORT` | where MySQL listens (default `127.0.0.1:3306`) |
| `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | must match what you created in step 1 |
| `DATABASE_URL` | *optional* full URL (`mysql+aiomysql://user:pass@host:3306/db?charset=utf8mb4`); overrides the `MYSQL_*` values. URL-encode special characters in the password (`@` → `%40`). |
| `JWT_SECRET` | signing key for login tokens. **Use a long random value** — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_EXPIRE_DAYS` | token lifetime (default 30) |
| `ADMIN_DEFAULT_PASSWORD` | password of the seeded admin (phone `9999999999`), applied on the first boot only |
| `CORS_ORIGINS` | `*` for dev; comma-separated origins in production |
| `MAPS_PROVIDER` | `osm` (free, no key) |
| `GOOGLE_MAPS_API_KEY` | optional |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | optional; cash / UPI / wallet demo payments work without them |

### Run

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

On the first start you should see `ReturnRide startup complete`. Then check:

- http://localhost:8001/api/ → `{"message":"ReturnRide API","status":"ok"}`
- http://localhost:8001/docs → interactive API docs

Seeded on first boot: fare settings, the admin, one demo passenger, three demo drivers, four landmarks and three demo rides on the Shirwal → Wai corridor.

> The seed fetches a real road route from the public OSRM server. If you're offline it falls back to a straight line, so everything still starts.

### Demo accounts

| Role | Phone | Password |
|------|-------|----------|
| Admin | `9999999999` | `admin1234` (or your `ADMIN_DEFAULT_PASSWORD`) |
| Passenger | `8000000001` | `demo1234` |
| Drivers | `9000000001`, `9000000002`, `9000000003` | `demo1234` |

---

## 3. Frontend

```bash
cd frontend
npm install              # (yarn install also works)
```

### `frontend/.env`
Only one variable is needed (template: `frontend/.env.example`):

```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```
It must be the address of the backend **as seen from the device running the app** (no trailing slash, no `/api`):

| Where the app runs | Value |
|--------------------|-------|
| Web browser on the same computer | `http://localhost:8001` |
| iOS simulator | `http://localhost:8001` |
| Android emulator | `http://10.0.2.2:8001` |
| Physical phone (Expo Go, same Wi-Fi) | `http://<your-computer-LAN-IP>:8001` e.g. `http://192.168.1.25:8001` |

After changing `.env`, restart Expo with a clean cache: `npx expo start -c`.

### Run

```bash
npx expo start --web     # browser
npx expo start           # then press a (Android), i (iOS) or scan the QR with Expo Go
```

Start the backend with `--host 0.0.0.0` (as above) so phones on your network can reach it, and allow port 8001 through your firewall if needed.

---

## 4. Run the tests

The test-suite calls a **running** backend over HTTP (it creates `TEST_…` users in the database you point it at, so use a dev database):

```bash
cd backend
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001 pytest -q            # macOS / Linux
$env:EXPO_PUBLIC_BACKEND_URL="http://localhost:8001"; pytest -q     # Windows PowerShell
```
Verified on this conversion: **42 passed** against MariaDB 10.11 (the same SQLAlchemy dialect as MySQL).

---

## 5. What changed from MongoDB

| MongoDB | MySQL |
|---------|-------|
| `ObjectId` `_id` | auto-increment `BIGINT id` — **still sent to clients as a string** |
| `users`, `rides`, `bookings`, `booking_events`, `audit_logs`, `app_settings`, `villages` collections | tables with the same names |
| nested `origin` / `dest` / `pickup` / `drop` / `fare_breakdown` / `driver_location` / `route_geometry` / audit `metadata` | `JSON` columns (`drop` is stored in `drop_point`, `pickup` in `pickup_point`, because `DROP` is a reserved SQL word — the API still says `pickup` / `drop`) |
| `driver_id`, `passenger_id`, `ride_id` strings | real `BIGINT` foreign keys |
| tz-aware datetimes | `DATETIME(6)` stored as UTC, returned as ISO-8601 with `+00:00` |
| `settings` doc `{_id:"fare"}` | one-row table `app_settings` (`id = 'fare'`) |
| `motor` / `pymongo` | `SQLAlchemy` (async) + `aiomysql` |
| unique index on `phone` | `UNIQUE` constraint on `users.phone` |

Files touched: `backend/db.py`, `models.py` (new), `auth.py`, `audit.py`, `rides.py`, `bookings.py`, `admin.py`, `seed.py`, `server.py`, `utils.py`, `requirements.txt`. The frontend and `maps.py` are untouched (apart from the new `frontend/.env`).

Small fixes made along the way:
- **Seed crash when OSRM is unreachable** (pre-existing): the 2-point fallback route made a landmark index go out of range and aborted startup.
- Seats are now reserved with an atomic `UPDATE … WHERE seats_available > 0` (no overbooking under concurrency), and an admin force-cancel now frees the seat.
- `/pay` rejects a second payment on the same booking (it would otherwise deduct the wallet twice).
- `/admin/users` and `/admin/logs` search treat `%` and `_` literally; list endpoints cap `limit`; admin PATCH validates `status` / `role` values.
- Admin stats and per-driver ride counts use SQL aggregates instead of per-row queries.

No data migration is included: existing MongoDB documents are not copied over (ObjectIds become new integer ids), and a fresh database is seeded automatically.

---

## 6. Going to production

- Set a strong `JWT_SECRET` and a non-default `ADMIN_DEFAULT_PASSWORD`; never commit `.env` (it's in `.gitignore`).
- Set `CORS_ORIGINS` to your real web origin(s).
- Use a dedicated MySQL user with privileges on the `returnride` database only, and enable automated backups (`mysqldump`).
- Run without `--reload`, behind HTTPS (nginx / Caddy): `uvicorn server:app --host 0.0.0.0 --port 8001 --workers 2`.
- Point `EXPO_PUBLIC_BACKEND_URL` at the public `https://` URL before building the app.
- The fare-settings cache is per process; with several workers a settings change is picked up by other workers after they restart.

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Log repeats `MySQL not ready (n/30)` | MySQL isn't running / wrong host or port. Docker: `docker compose ps`. The backend retries for ~60 s before giving up. |
| `Access denied for user 'returnride'` | user/password in `backend/.env` don't match step 1. Re-run `database/setup.sql` or fix `MYSQL_PASSWORD`. |
| `Unknown database 'returnride'` | run step 1 (database must exist; tables are auto-created). |
| `'cryptography' package is required for sha256_password or caching_sha2_password` | `pip install cryptography` (it's in `requirements.txt`). |
| `ValueError: password cannot be longer than 72 bytes` / bcrypt `__about__` errors | wrong bcrypt version: `pip install bcrypt==4.0.1`. |
| App shows "Network error" on a phone | wrong `EXPO_PUBLIC_BACKEND_URL` (don't use `localhost` on a phone), backend not started with `--host 0.0.0.0`, firewall, or different Wi-Fi. Restart Expo with `-c`. |
| Map search / routes empty | public Nominatim/OSRM unreachable (rate-limited or offline); routes fall back to straight lines. |
| `Port 8001 already in use` | stop the other process or use `--port 8002` and update `EXPO_PUBLIC_BACKEND_URL`. |
| Tests: `EXPO_PUBLIC_BACKEND_URL must be set` | export the variable (section 4) with the backend running. |

## 8. Project layout

```
returnride/
├─ docker-compose.yml        optional MySQL container
├─ .env / .env.example       (for docker-compose only)
├─ database/
│  ├─ setup.sql              create DB + user
│  └─ schema.sql             full schema (generated from models.py)
├─ backend/
│  ├─ .env / .env.example
│  ├─ server.py              app, startup (create tables + seed)
│  ├─ db.py  models.py       engine/session, ORM models
│  ├─ auth.py rides.py bookings.py admin.py maps.py seed.py audit.py utils.py
│  └─ tests/
└─ frontend/
   ├─ .env / .env.example    EXPO_PUBLIC_BACKEND_URL
   └─ app/ src/              Expo Router screens + components
```

# ReturnRide

Rural return-trip ride booking. **FastAPI + MySQL (SQLAlchemy async)** backend and an
**Expo (React Native / expo-router)** frontend for Android, iOS and Web.

➡️ **Full setup guide: [SETUP.md](SETUP.md)**

## Quick start

```bash
# 1. MySQL (Docker) — or install MySQL yourself, see SETUP.md
docker compose up -d

# 2. Backend  (http://localhost:8001, docs at /docs)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# 3. Frontend  (new terminal)
cd frontend
npm install
npx expo start --web          # or: npx expo start  (scan the QR with Expo Go)
```

Env files are already provided (`.env` for local dev, `.env.example` as templates).
Demo logins: admin `9999999999` / `admin1234`, passenger `8000000001` / `demo1234`,
driver `9000000001` / `demo1234`.

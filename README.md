# 📧 ReachInbox — Full-Stack Email Job Scheduler

A production-grade email scheduling service with a React dashboard. Built for the ReachInbox hiring assignment.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Features Implemented](#features-implemented)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
- [Running the Application](#running-the-application)
- [How Scheduling Works](#how-scheduling-works)
- [Persistence on Restart](#persistence-on-restart)
- [Rate Limiting & Concurrency](#rate-limiting--concurrency)
- [Slack Notifications](#slack-notifications)
- [Elasticsearch Search](#elasticsearch-search)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Assumptions & Trade-offs](#assumptions--trade-offs)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React Frontend (Vite)                        │
│      Login │ Scheduled │ Sent │ Compose (full page) │ Slack        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ REST API + JWT Auth
┌──────────────────────────────▼──────────────────────────────────────┐
│                      Express.js Backend                             │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────────┐   │
│  │ Auth    │  │ Email    │  │ Sender    │  │ Slack             │   │
│  │ Routes  │  │ Routes   │  │ Routes    │  │ Routes            │   │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  └────────┬──────────┘   │
│       └─────────┐  │              │                  │              │
│            ┌────▼──▼──────────────▼──────────────────▼──────────┐   │
│            │              Service Layer                          │   │
│            │  emailService │ rateLimiter │ slackService │ esService │
│            └────┬─────────────┬─────────────┬──────────────┬────┘   │
│                 │             │             │              │         │
│  ┌──────────────▼─┐  ┌───────▼──────┐  ┌──▼─────────┐  ┌▼───────┐ │
│  │  PostgreSQL    │  │   Redis      │  │ Ethereal   │  │  ES    │ │
│  │  (Prisma ORM) │  │  (BullMQ)    │  │ SMTP       │  │        │ │
│  └────────────────┘  └──────────────┘  └────────────┘  └────────┘ │
│                           │                                         │
│              ┌────────────▼───────────────┐                         │
│              │    BullMQ Email Worker      │                         │
│              │ (Delayed Jobs + Rate Limit) │                         │
│              └────────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Features Implemented

### ✅ Backend

| Feature | Status | Description |
|---------|--------|-------------|
| Email Scheduling API | ✅ | POST /api/emails/schedule — accepts recipients, subject, body, time |
| BullMQ Delayed Jobs | ✅ | No cron — uses BullMQ `delay` for precise scheduling |
| PostgreSQL Persistence | ✅ | All email jobs stored in DB via Prisma ORM |
| Ethereal Email SMTP | ✅ | Sends via Ethereal fake SMTP; preview URLs logged |
| Multiple Senders | ✅ | Auto-creates Ethereal accounts per sender |
| Elasticsearch Indexing | ✅ | Full-text search on recipient, subject, body |
| BullMQ Dashboard | ✅ | Live at `/admin/queues`, protected by basic auth (`BULL_BOARD_USER`/`BULL_BOARD_PASSWORD`) |
| Server Restart Persistence | ✅ | Redis AOF + DB records; boot-time reconciliation re-enqueues orphaned jobs |
| Idempotency | ✅ | DB record ID used as BullMQ jobId; deterministic retry ids — no duplicate sends |
| Bulk Scheduling (1000+) | ✅ | `createMany` + `addBulk` + bulk ES index — constant round-trips regardless of batch size |
| Worker Concurrency | ✅ | Configurable via `WORKER_CONCURRENCY` env var (default: 5) |
| Min Delay Between Sends | ✅ | 2000ms default — configurable via `MIN_DELAY_BETWEEN_EMAILS_MS` |
| Per-Sender Rate Limiting | ✅ | Atomic Lua INCR counters per `sender:hourWindow` key; slot released on send failure |
| Global Rate Limiting | ✅ | Atomic global hourly counter, checked in the same Lua script |
| Rate-Limited Job Rescheduling | ✅ | Delayed to next available hour window; order preserved |
| Slack OAuth Integration | ✅ | Real OAuth flow with CSRF `state` nonce → stores webhook → sends notifications |
| Slack Rate Limit Alerts | ✅ | Live Slack message when hourly limit reached |
| Google OAuth Login | ✅ | Passport.js Google Strategy → JWT tokens |
| CSV Upload & Parse | ✅ | Multer + csv-parse for bulk recipient upload |

### ✅ Frontend

| Feature | Status | Description |
|---------|--------|-------------|
| Google OAuth Login | ✅ | Real Google Sign-In; Figma-matched login card |
| Figma-matched UI | ✅ | Green/ONB theme, Gmail-style sidebar + email list, pixel-matched to the design |
| User Profile in Sidebar | ✅ | Name, email, avatar, logout dropdown (the design has no top header) |
| Scheduled Emails | ✅ | Email-list rows: recipient, time pill, subject + preview, status, pagination |
| Sent Emails | ✅ | Email-list rows: recipient, sent/failed pill, subject + preview, pagination |
| Compose (full page) | ✅ | From + New sender, To chips + Upload List, Subject, Delay, Hourly Limit, body + Send Later popover |
| CSV/TXT Upload | ✅ | "Upload List" / paperclip, parses and adds recipients, shows detected count |
| Sender Management | ✅ | Create & pick Ethereal senders inline in Compose |
| Slack Integration UI | ✅ | Connect/disconnect Slack from the sidebar card |
| Email Search | ✅ | Full-text search via Elasticsearch |
| Loading States | ✅ | Skeleton rows while lists load |
| Empty States | ✅ | Friendly messages with CTAs |
| Error Handling | ✅ | Toast notifications via react-hot-toast |
| Reusable Components | ✅ | Button, Input, Modal, Badge, Pagination, EmptyState, LoadingSpinner, EmailList |
| TypeScript Types | ✅ | Full type coverage for API responses & component props |
| Auto-Refresh | ✅ | Dashboard refreshes every 30 seconds |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend Runtime | Node.js + TypeScript |
| Backend Framework | Express.js |
| Database | PostgreSQL 15 (via Prisma ORM) |
| Queue | BullMQ (backed by Redis 7) |
| Search | Elasticsearch 8.11 |
| Email | Ethereal Email (fake SMTP via Nodemailer) |
| Auth | Passport.js (Google OAuth 2.0) + JWT |
| Frontend | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3.4 |
| Icons | Lucide React |
| Infra | Docker Compose (Redis, PostgreSQL, Elasticsearch) |

---

## Prerequisites

- **Node.js** 18+
- **Docker** & **Docker Compose** (for Redis, PostgreSQL, Elasticsearch)
- **Google OAuth** credentials (from [Google Cloud Console](https://console.cloud.google.com/))
- **Slack App** credentials (from [Slack API](https://api.slack.com/apps)) — for Slack notifications

---

## Setup Guide

### 1. Clone & Install

```bash
# Clone the repository
git clone <your-repo-url>
cd Assignment

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Start Infrastructure (Docker)

```bash
# From project root
docker-compose up -d
```

This starts:
- **PostgreSQL** on port `5432` (user: `reachinbox`, password: `reachinbox123`, db: `reachinbox`)
- **Redis** on port `6379` (with AOF persistence enabled)
- **Elasticsearch** on port `9200`

### 3. Set Up Ethereal Email

1. Go to [https://ethereal.email](https://ethereal.email)
2. Click "Create Ethereal Account"
3. Note the username and password

> **Note:** The `SMTP_USER`/`SMTP_PASS` in `.env` are only a **fallback** used when a job has no selected sender. In normal use you add senders from the dashboard ("New" in Compose), which auto-provisions a fresh Ethereal account per sender via `nodemailer.createTestAccount()` — so you don't strictly need to fill these in to send.

### 4. Set Up Google OAuth

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Set **Authorized redirect URIs** to: `http://localhost:3000/api/auth/google/callback`
4. Copy the Client ID and Client Secret

### 5. Set Up Slack App (for notifications)

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app → "From scratch"
3. Under **OAuth & Permissions**, add the `incoming-webhook` scope
4. Set the **Redirect URL** to: `http://localhost:3000/api/slack/callback`
5. Copy Client ID and Client Secret from **Basic Information**

### 6. Configure Environment Variables

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your credentials:

```env
DATABASE_URL=postgresql://reachinbox:reachinbox123@localhost:5432/reachinbox
REDIS_HOST=localhost
REDIS_PORT=6379
ELASTICSEARCH_URL=http://localhost:9200

# Ethereal Email credentials
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your-ethereal-user@ethereal.email
SMTP_PASS=your-ethereal-password

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Slack OAuth
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_REDIRECT_URI=http://localhost:3000/api/slack/callback

# JWT Secret (change for production)
JWT_SECRET=your-super-secret-jwt-key

# BullMQ Dashboard basic auth (protects /admin/queues)
BULL_BOARD_USER=admin
BULL_BOARD_PASSWORD=admin

# Rate Limiting
MAX_EMAILS_PER_HOUR=200
MAX_EMAILS_PER_HOUR_PER_SENDER=50
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000

# Frontend URL
FRONTEND_URL=http://localhost:5173

PORT=3000
```

### 7. Initialize Database

```bash
cd backend
npx prisma generate
npx prisma db push
```

---

## Running the Application

### Start Backend

```bash
cd backend
npm run dev
```

The backend starts at `http://localhost:3000`:
- API: `http://localhost:3000/api/`
- BullMQ Dashboard: `http://localhost:3000/admin/queues`
- Health Check: `http://localhost:3000/api/health`

### Start Frontend

```bash
cd frontend
npm run dev
```

The frontend starts at `http://localhost:5173` with a proxy to the backend.

---

## How Scheduling Works

1. **User submits** a schedule request (via Compose modal or API)
2. **Backend creates** a `EmailJob` record in PostgreSQL with status `SCHEDULED`
3. **BullMQ delayed job** is added with:
   - `delay = max(0, scheduledAt - now) + (position × delayBetweenEmails)`
   - `jobId = emailJob.id` (DB record ID → ensures idempotency)
4. **Status updated** to `QUEUED` in DB
5. **When delay expires**, the BullMQ worker picks up the job:
   - Checks idempotency (already sent? skip)
   - Checks rate limit (Redis counters)
   - If rate-limited → reschedule to next available window + notify Slack
   - If allowed → send via Ethereal SMTP
   - Apply minimum delay between sends
   - Update status to `SENT` + index in Elasticsearch
6. **On failure**, job is marked `FAILED` in DB with error message

```
User → API → DB (SCHEDULED) → BullMQ (delayed) → Worker → Rate Check → SMTP → DB (SENT) → ES Index
                                                     ↓ (if rate limited)
                                             Reschedule + Slack Alert
```

### ❌ No Cron Jobs Used

- No `crontab`, `node-cron`, `agenda`, or any cron library
- Scheduling relies entirely on **BullMQ's `delay` option** which persists in Redis

---

## Persistence on Restart

### How it works:

1. **Redis AOF** (`--appendonly yes`): BullMQ delayed jobs are stored in Redis. With AOF enabled, Redis writes every operation to disk. On restart, Redis replays the AOF log and all pending delayed jobs are restored.

2. **PostgreSQL records**: Every email job has a corresponding DB record. The DB is the source of truth for job metadata and status.

3. **On server restart**:
   - Redis recovers all delayed BullMQ jobs from its AOF log
   - The BullMQ worker reconnects and resumes processing
   - Jobs fire at their original scheduled time (BullMQ uses absolute timestamps internally)
   - No emails are duplicated because the worker checks `emailJob.status === 'SENT'` before sending

4. **Idempotency guarantee**: Each BullMQ job's `jobId` is the PostgreSQL `EmailJob.id`. BullMQ prevents duplicate jobs with the same ID. Rate-limit retries use a deterministic `{id}-retry-{n}` id so a duplicated reschedule event de-dupes while successive windows stay distinct. Additionally, the worker checks the DB status before sending.

5. **Boot-time reconciliation**: On startup the server runs `reconcilePendingJobs()` — it scans the DB for jobs still in `SCHEDULED`/`QUEUED`/`RATE_LIMITED`, and for any whose BullMQ job is missing from Redis (e.g. Redis data loss beyond AOF), it re-enqueues them from the DB record (preserving `maxPerHour`, which is persisted on the `EmailJob`). This makes the DB the ultimate source of truth; the `status === 'SENT'` guard ensures nothing is ever re-sent.

---

## Rate Limiting & Concurrency

### Worker Concurrency

- **Configurable** via `WORKER_CONCURRENCY` env var (default: 5)
- BullMQ worker processes up to N jobs simultaneously
- Each job independently checks rate limits via Redis (atomic INCR)

### Minimum Delay Between Sends

- **Default: 2000ms** (configurable via `MIN_DELAY_BETWEEN_EMAILS_MS`)
- Applied after each email send within the worker
- Mimics real provider throttling

### Rate Limiting Logic

Rate limiting uses an atomic Redis Lua script with counters that expire at the next UTC hour:

```
Key:   ratelimit:{senderEmail}:{hourWindow}
       ratelimit:global:{hourWindow}
TTL:   3600 seconds (auto-expires)
```

**Algorithm (per job):**
1. Increment both sender and global counters in one script.
2. Set a key's expiry only when it is first created, ending at the next UTC hour.
3. If either configured limit would be exceeded, roll both increments back in the same script.
4. Otherwise permit the send.
5. If the SMTP send then fails, the worker calls `releaseRateLimit()` to DECR (floored at zero) the slot it consumed, so BullMQ retries and permanent failures don't leak hourly quota — exactly one slot is spent per successful send.

The compose form's **Max / Hour** can further reduce a job's sender limit; the effective sender limit is the lower of that value and `MAX_EMAILS_PER_HOUR_PER_SENDER`.

**When rate limit is reached:**
- The worker records `RATE_LIMITED` and directly queues one delayed replacement job for the next available hour window
- DB status is set to `RATE_LIMITED`
- Slack notification is sent (if connected)
- The rescheduled job preserves order as much as possible

### Behavior Under Load (1000+ emails)

When 1000+ emails are scheduled for roughly the same time:
0. **Ingestion is O(1) round-trips**: the schedule endpoint inserts all rows with a single `createMany`, enqueues them with a single `addBulk`, and indexes them with a single Elasticsearch `bulk` call — so a 1000-recipient request doesn't do 4000 serial awaits.
1. BullMQ staggers them using the per-recipient `delayBetweenEmails` offset
2. The worker processes `WORKER_CONCURRENCY` jobs in parallel
3. Rate limits kick in after `MAX_EMAILS_PER_HOUR_PER_SENDER` sends
4. Remaining jobs are rescheduled to the next hour window
5. The system drains the backlog over multiple hour windows

---

## Slack Notifications

### Flow:
1. User clicks **"Connect Slack"** in the sidebar
2. Redirects to Slack OAuth with `incoming-webhook` scope
3. User authorizes → Slack returns webhook URL
4. Backend stores the webhook URL in the User record
5. When a rate limit is hit, the backend POSTs to the webhook:

```json
{
  "text": "⚠️ Rate Limit Alert",
  "blocks": [{
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "⚠️ *Rate Limit Reached*\n\n*Sender:* user@ethereal.email\n*Current Count:* 50/50 emails this hour\n*User:* John Doe\n\nEmails have been automatically rescheduled..."
    }
  }]
}
```

### Edge Cases:
- **No Slack connected**: Rate limit hits silently skip notification (no crash)
- **Disconnect/reconnect**: Removing Slack clears the webhook; reconnecting stores a new one. No redeploy needed.

---

## Elasticsearch Search

- Emails are indexed on create/send to the `emails` index
- Full-text search on `subject` (boosted 2x), `body`, and `recipient`
- Fuzzy matching enabled (`fuzziness: 'AUTO'`)
- **Graceful degradation**: If Elasticsearch is unavailable, falls back to PostgreSQL `ILIKE` queries

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google` | Initiate Google OAuth login |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/logout` | Logout |

### Emails
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/emails/schedule` | Schedule emails |
| GET | `/api/emails/scheduled?page=1&limit=20` | List scheduled emails |
| GET | `/api/emails/sent?page=1&limit=20` | List sent emails |
| GET | `/api/emails/search?q=term` | Search emails (ES) |
| GET | `/api/emails/stats` | Get email statistics |
| POST | `/api/emails/upload-csv` | Upload CSV for recipients |

### Senders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/senders` | Create new Ethereal sender |
| GET | `/api/senders` | List senders |
| DELETE | `/api/senders/:id` | Delete a sender |

### Slack
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/slack/connect` | Initiate Slack OAuth |
| GET | `/api/slack/callback` | Slack OAuth callback |
| POST | `/api/slack/disconnect` | Disconnect Slack |
| GET | `/api/slack/status` | Check connection status |

### Infrastructure
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/admin/queues` | BullMQ Dashboard (Bull Board) |

---

## Project Structure

```
Assignment/
├── docker-compose.yml              # Redis, PostgreSQL, Elasticsearch
├── README.md                       # This file
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example                # Environment variable template
│   ├── prisma/
│   │   └── schema.prisma           # DB schema (User, Sender, EmailJob)
│   └── src/
│       ├── index.ts                # Express app entry point
│       ├── config/
│       │   ├── index.ts            # Typed config from env vars
│       │   ├── redis.ts            # IORedis connection factory
│       │   ├── database.ts         # Prisma client singleton
│       │   ├── elasticsearch.ts    # ES client + index setup
│       │   ├── smtp.ts             # Nodemailer transporter factory
│       │   └── queue.ts            # BullMQ Queue setup
│       ├── types/
│       │   └── index.ts            # TypeScript interfaces
│       ├── middleware/
│       │   └── auth.ts             # JWT authentication middleware
│       ├── routes/
│       │   ├── auth.ts             # Google OAuth routes
│       │   ├── emails.ts           # Email CRUD + scheduling routes
│       │   ├── senders.ts          # Sender management routes
│       │   └── slack.ts            # Slack OAuth routes
│       ├── services/
│       │   ├── emailService.ts     # Core scheduling logic
│       │   ├── rateLimiter.ts      # Redis-based rate limiting
│       │   ├── slackService.ts     # Slack OAuth + webhook
│       │   └── elasticsearchService.ts # ES indexing + search
│       └── workers/
│           └── emailWorker.ts      # BullMQ worker (sends emails)
│
└── frontend/
    ├── package.json
    ├── vite.config.ts              # Vite config with API proxy
    ├── tailwind.config.js          # Tailwind theme (green/ONB palette, Figma-matched)
    ├── postcss.config.js
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx                # React entry + BrowserRouter + Toaster
        ├── App.tsx                 # Routes (Login, Callback, Dashboard)
        ├── index.css               # Tailwind directives + custom styles
        ├── types/
        │   └── index.ts            # TypeScript interfaces
        ├── services/
        │   └── api.ts              # Axios client + API functions
        ├── hooks/
        │   └── useAuth.tsx         # Auth context + ProtectedRoute
        ├── pages/
        │   ├── LoginPage.tsx       # Google Sign-In page
        │   ├── AuthCallback.tsx    # Token extraction + redirect
        │   └── DashboardPage.tsx   # Main dashboard with all views
        └── components/
            ├── Layout/
            │   ├── Sidebar.tsx     # ONB logo, user card, Compose, Scheduled/Sent, Slack
            │   └── DashboardLayout.tsx
            ├── Dashboard/
            │   └── EmailList.tsx   # Gmail-style email rows (status/time pills, preview)
            ├── Compose/
            │   └── ComposeModal.tsx # Full-page compose: chips, Upload List, Send Later
            └── Common/
                ├── Button.tsx      # Reusable button (variants + loading)
                ├── Input.tsx       # Reusable input (label + error + icon)
                ├── Modal.tsx       # Overlay modal (escape + click outside)
                ├── Badge.tsx       # Status badge (color-coded)
                ├── Pagination.tsx  # Page navigation
                ├── EmptyState.tsx  # Empty state with icon + CTA
                └── LoadingSpinner.tsx
```

---

## Assumptions & Trade-offs

1. **Ethereal Email**: Since Ethereal is a test SMTP service, `nodemailer.createTestAccount()` is used to auto-generate sender accounts. In production, you'd configure real SMTP providers.

2. **Rate-limit scope**: Sender and global counters reset on UTC hour boundaries. The sender counter is shared for identical sender addresses, so two users intentionally using the same SMTP identity share its quota.

3. **Elasticsearch as optional**: If ES is unavailable, the system gracefully falls back to PostgreSQL `ILIKE` queries. This ensures the system works even without ES running.

4. **BullMQ job ID reuse**: Using the DB record ID as the BullMQ jobId means a job can only exist once. If a job fails and needs rescheduling (rate limit), a new jobId is generated with a `-retry-{timestamp}` suffix to avoid ID conflicts.

5. **Slack webhook storage**: The Slack webhook URL is stored directly on the User record (per-user, not per-sender). If per-sender notifications are needed, the schema could be extended.

6. **JWT-based auth**: Sessions are stateless via JWT in the Authorization header. The token is stored in localStorage on the frontend. For production, httpOnly cookies with CSRF protection would be more secure.

7. **Min delay between sends**: The 2-second default delay is applied per worker thread. With `WORKER_CONCURRENCY=5`, up to 5 emails can be sent in parallel, each with their own 2s delay, resulting in ~2.5 emails/second throughput.

---

## Demo Scenarios

### 1. Schedule & Send Emails
1. Login with Google
2. Click **Compose** → in the **From** row click **+ New** to auto-generate an Ethereal sender
3. Add recipients as chips (or **Upload List** for a CSV/TXT), fill Subject + body
4. Click the **clock** → **Send Later** → pick a time (or just **Send** to send now)
5. Watch emails move from **Scheduled** → **Sent** in the sidebar

### 2. Server Restart Persistence
1. Schedule emails for 5 minutes in the future
2. Stop the backend (`Ctrl+C`)
3. Wait, then restart (`npm run dev`)
4. Emails still send at the originally scheduled time ✅

### 3. Rate Limiting
1. Set `MAX_EMAILS_PER_HOUR_PER_SENDER=5` in `.env`
2. Schedule 20 emails for the same time
3. First 5 send normally
4. Remaining 15 get `RATE_LIMITED` status and are rescheduled
5. If Slack is connected, you'll get a notification

---

*Built with ❤️ for the ReachInbox assignment*

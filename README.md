
---

# 🎥 Pixovid — AI Video & Image Generation Studio
For now razorpay is in test mode till my credentials got verified and every calling is charged for some time


> **Democratizing cinematic AI video creation.** Pixovid is an all-in-one generative AI media studio that combines prompt-to-video generation, face-fusion avatar replacement, multi-track template stitching, and a transaction-safe credit economy into a single web application.

---

## ✨ Key Features

- 🎬 **Prompt-to-Video & Image Generation**: Orchestrates top-tier AI models (**Seedance 2.0, Kling V3, FLUX.2, Gemini 3.1**) with automatic fallback logic during provider outages.
- 🎭 **AI Avatars & Hybrid Face Swapping**: Create custom identity avatars from photos. Supports both local pixel-level **FaceFusion** and cloud-based diffusion identity edits.
- 🎼 **Multi-Track Premiere-Style Template Engine**: Author and render complex video templates featuring multi-clip timelines, audio lane mixing, link groups, and slot-based avatar placement.
- 💳 **Credit Economy & Razorpay Billing**: Transaction-safe credit ledger (`CreditTransaction` + Neon DB) with automatic refunds on failed generations and Razorpay payment pack integration.
- 🚀 **Bun Monorepo Architecture**: Lightning-fast build and development orchestration powered by **Turborepo, Express, React (Vite), Prisma, and Better-Auth**.

---

## 🏗️ Monorepo Structure

```text
pixovid/
├── apps/
│   ├── frontend/         # React + Vite + Tailwind CSS + Lucide Icons
│   └── backend/          # Express API + Better-Auth + OpenRouter SDK + Razorpay
├── packages/
│   ├── db/               # Prisma ORM schema & Neon PostgreSQL connection
│   ├── eslint-config/    # Shared ESLint rules
│   └── typescript-config/# Shared tsconfig presets
├── docker-compose.yaml   # Local dev services (MinIO object store, FaceFusion)
└── turbo.json            # Turborepo task pipeline
```

---

## ⚡ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Runtime & Monorepo** | [Bun](https://bun.sh/), [Turborepo](https://turbo.build/) |
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide React, React Router |
| **Backend API** | Node.js, Express, TypeScript |
| **Authentication** | [Better-Auth](https://www.better-auth.com/) (Google OAuth + Email/Pass) |
| **Database & ORM** | PostgreSQL ([Neon Serverless](https://neon.tech/)), [Prisma ORM](https://www.prisma.io/) |
| **Storage** | MinIO / Cloudflare R2 / S3-compatible Object Storage |
| **AI Providers** | OpenRouter (Video & Image models), Local/Cloud FaceFusion |
| **Payments** | Razorpay (Credit Packs & Webhooks) |

---

## 🚀 Getting Started

### 1. Prerequisites

Ensure you have the following installed on your machine:
- **Bun** (v1.2+): `curl -fsSL https://bun.sh/install | bash`
- **Node.js** (v20+)
- **PostgreSQL Database** (e.g., Neon PostgreSQL)

---

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Naman-yk/Pixovid2.git
cd Pixovid2
bun install
```

---

### 3. Environment Setup

Create `.env` files in the root directory and `apps/backend/.env`:

```env
# ---- Database ----
DATABASE_URL="postgresql://user:password@ep-host.neon.tech/neondb?sslmode=require"

# ---- Auth ----
BETTER_AUTH_SECRET="your-super-secret-key"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# ---- OpenRouter AI ----
OPENROUTER_API_KEY="sk-or-v1-your-key"
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"

# ---- Razorpay Billing ----
RAZORPAY_KEY_ID="rzp_test_xxxxxx"
RAZORPAY_KEY_SECRET="your-razorpay-secret"

# ---- Storage (MinIO / R2) ----
MINIO_ENDPOINT="your-storage-endpoint"
MINIO_ACCESS_KEY="your-access-key"
MINIO_SECRET_KEY="your-secret-key"
MINIO_BUCKET="videoarena"
```

---

### 4. Database Sync

Push the Prisma schema to your database:

```bash
bunx prisma db push --schema packages/db/prisma/schema.prisma
```

---

### 5. Running the Application

Start the frontend and backend in parallel using Turborepo:

```bash
# Start all development servers
bun run dev
```

- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:4000`

---

## 🛠️ Available Scripts

| Command | Description |
| :--- | :--- |
| `bun run dev` | Runs frontend and backend in parallel with hot reloading |
| `bun run build` | Builds all packages and apps for production |
| `bun run lint` | Runs ESLint across all apps and packages |
| `bun run format` | Formats codebase using Prettier |

---

## 🔒 Credit & Refund Economics

Pixovid tracks credit spending through an append-only audit ledger (`CreditTransaction` table):

```ts
// Example: Safe transaction-backed deduction with automatic rollback
await spendCredits(userId, cost, {
  referenceType: "video",
  referenceId: video.id,
  description: "Video generation",
});
```

- **Image Generation**: ~6 credits
- **Video Generation**: ~60 credits
- **Template Render**: ~1000 credits
- **Automatic Refund**: If an AI provider returns an error or empty payload, credits are automatically refunded to the user's live balance.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

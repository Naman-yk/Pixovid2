# Backend Dockerfile for Production Deployment
FROM oven/bun:1 AS base
WORKDIR /app

# Copy root package files & lockfile
COPY package.json bun.lock ./

# Copy workspace package manifests
COPY apps/backend/package.json apps/backend/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json

# Install dependencies
RUN bun install

# Copy full source code for dependencies and backend
COPY packages/db packages/db
COPY packages/typescript-config packages/typescript-config
COPY packages/eslint-config packages/eslint-config
COPY apps/backend apps/backend

# Generate Prisma Client
RUN cd packages/db && bun run db:generate

WORKDIR /app/apps/backend

EXPOSE 4000

# Push database schema & start Express backend server
CMD ["sh", "-c", "cd /app/packages/db && bun run db:push && cd /app/apps/backend && bun run start"]

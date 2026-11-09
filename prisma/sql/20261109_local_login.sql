-- [MoM 30/10 §4] Additive auth migration. Production requires separate release approval.
BEGIN;
CREATE TABLE "sny_users" (
 "id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE,
 "passwordHash" TEXT NOT NULL, "failedAttempts" INTEGER NOT NULL DEFAULT 0,
 "lockedUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "sny_sessions" (
 "tokenHash" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "sny_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sny_sessions_expiresAt_idx" ON "sny_sessions"("expiresAt");
CREATE INDEX "sny_sessions_userId_idx" ON "sny_sessions"("userId");
COMMIT;

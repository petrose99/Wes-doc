import { defineConfig } from "vitest/config"
import path from "path"

/** Live-DB tests. Point DATABASE_URL at the Docker pgvector on 55432 (stop `next dev` first —
 * PGlite is single-connection); every test file here has the `.db.test.ts` extension so `npm
 * test` (the fast pure suite) never picks them up by accident. Run with `npm run test:db`. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.db.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sequential — every test mutates the same DB, so parallel isolation would fight the
    // (per-test) workspace fixtures.
    fileParallelism: false,
    // config.ts's zod parse runs at import time — inject the same fixed-key/base-URL the fast
    // suite already uses so a fresh vitest process doesn't need every .env variable loaded.
    env: {
      BASE_URL: process.env.BASE_URL || "http://localhost:7331",
      SECRETS_ENCRYPTION_KEY: process.env.SECRETS_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString("base64"),
      DATABASE_URL: process.env.DATABASE_URL || "",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "test-anon",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service",
    },
  },
  resolve: {
    alias: [
      { find: "@/prisma/client", replacement: path.resolve(__dirname, "prisma/client/client") },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
})

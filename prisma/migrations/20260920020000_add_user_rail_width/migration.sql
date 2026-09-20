-- #342 (Wayfinder map #226): per-user sidebar rail width ("icons" | "labels" | "auto"),
-- replacing the localStorage-only pin. Additive only; every existing user reads "auto",
-- matching their current effective (unpinned) behavior.
ALTER TABLE "users" ADD COLUMN "rail_width" TEXT NOT NULL DEFAULT 'auto';

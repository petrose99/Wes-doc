-- #84: tri-state workspace enrolment in the deferred-import-VAT scheme. Nullable BOOLEAN so
-- the UI can distinguish enrolled / not enrolled / not stated; the LS return-form workpaper
-- (#85) silent-passes imports on a workspace with null (`isDeferred = null`) per #82's
-- projection contract. Per-bill override stays in reviewedData JSON — no column here.
ALTER TABLE "workspaces" ADD COLUMN "deferred_vat_scheme" BOOLEAN;

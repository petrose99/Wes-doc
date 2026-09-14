-- #206: acceptable overage (percent of ordered quantity) before the PO/invoice line-consumption
-- check flags a description group. Separate from the existing amount-level tolerance.
ALTER TABLE "workspaces" ADD COLUMN "po_quantity_tolerance_percent" DOUBLE PRECISION NOT NULL DEFAULT 5;

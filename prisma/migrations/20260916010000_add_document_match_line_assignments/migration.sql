-- #228 Q10 / #250 (Wayfinder map 226): a manual Line match — invoiceRow → poLineIndex | null —
-- persisted on the PO↔invoice DocumentMatch so po_line_consumption honours it over its guess.
ALTER TABLE "document_matches" ADD COLUMN     "line_assignments" JSONB;

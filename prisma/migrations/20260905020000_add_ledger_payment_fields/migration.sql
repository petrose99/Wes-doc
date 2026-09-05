-- Add payment tracking fields to ledger_transactions for Phase A payment round trip
ALTER TABLE ledger_transactions ADD COLUMN due_amount DOUBLE PRECISION;
ALTER TABLE ledger_transactions ADD COLUMN paid_amount DOUBLE PRECISION;
ALTER TABLE ledger_transactions ADD COLUMN payment_status TEXT;

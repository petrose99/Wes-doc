-- #79: back-fill lockSnapshot on locked closes with workspaceModeAtLock + reviewerOfRecord.
-- Ticket allows the safest default: 'firm' + null. No SMB workspaces existed before this
-- ticket (Reviewer capability shipped in #75; SMB derivation began there), so treating every
-- historical locked period as firm can't retroactively promote an SMB record.
-- Merges rather than overwrites so packCode/packVersion/lockedAt stay whatever v1 wrote.
UPDATE "closes"
SET "lock_snapshot" = COALESCE("lock_snapshot", '{}'::jsonb)
                      || jsonb_build_object(
                        'workspaceModeAtLock', 'firm',
                        'reviewerOfRecord', NULL
                      )
WHERE "state" = 'locked'
  AND (
    "lock_snapshot" IS NULL
    OR NOT ("lock_snapshot" ? 'workspaceModeAtLock')
  );

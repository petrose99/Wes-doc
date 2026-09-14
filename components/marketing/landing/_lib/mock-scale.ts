/**
 * The public marketing mocks are diagrams, not screenshots. Keep their text
 * on a small, named scale so evidence stays readable as the mock surfaces grow.
 *
 * - evidence: document names, values, statuses, and other strings a visitor
 *   needs to check against the surrounding claim (14px)
 * - supporting: metadata and explanatory labels that orient the evidence (12px)
 */
export const MOCK_TYPE = {
  evidence: "text-sm leading-[1.45]",
  supporting: "text-xs leading-[1.4]",
  label: "text-xs font-bold uppercase tracking-[.07em]",
} as const

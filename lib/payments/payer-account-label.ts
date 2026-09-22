/** "Standard Bank ····4321" — the Payer account's label on every column, file name and
 * remittance advice. Client-safe (no Prisma); `models/payer-accounts.ts` re-exports it. */
export function payerAccountLabel(account: { name: string; lastFour: string | null } | null | undefined): string {
  if (!account) return "—"
  return account.lastFour ? `${account.name} ····${account.lastFour}` : account.name
}

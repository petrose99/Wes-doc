---
status: accepted
---

# A statement settles a Payment line on its own only by reference; everything else is a suggestion an Owner confirms

ADR 0007 made the Payment line the unit of settlement and left open how a Bank Statement line is judged to pay one. The existing matcher (`lib/bank-match`, invoices and receipts against statement lines) scores amount, date and counterparty together, allows 1% amount slack, ignores direction and silently keeps the best of several candidates. That is tolerable for suggesting a reconciliation; it is wrong for deciding that money left the account, where a wrong Paid means a bill that never gets paid. We decided (#411) that **only a reference DocuBite wrote, with the exact amount, settles a line without a person**. Every weaker match is a **Settlement suggestion** an Owner confirms.

## The rules

- **Candidate lines:** debits (credits for returns) in the batch's currency, on a statement whose account number is the batch's payer account (last four digits when masked) or has no readable account number. A statement for another account is never read.
- **Settles automatically:**
  - a Line reference in the description (whole token, case- and space-insensitive) and the line's exact amount — no date window;
  - a **Batch reference** in the description and the exact sum of that batch's still-Sent lines, which settles all of them. Written in the file header where the bank's format carries it to the payer's statement (Nedbank LS, Absa BIO and others show one consolidated debit).
- **Suggested only** (an Owner confirms; source `statement`, with the statement line and who confirmed):
  - exact amount, counterparty overlap with the Payee, dated from the file download to Sent + 14 days, **Sent lines only**;
  - a debit equal to the exact sum of one Sent batch's still-Sent lines, without a Batch reference. No subset-sum.
  - Several candidates are all listed; none is chosen or dropped silently.
- **Amount** is exact to the currency's rounding: DocuBite wrote it, and ZA and LS banks charge the fee on a separate line.
- **Returns:** a credit with a Line reference and the exact amount makes a Paid line Returned (Paid → Failed, reason "Returned by the bank") or a Sent line Failed, automatically; Owners are told and the row returns to Bill Pay. A credit without the reference is a suggestion, within 30 days of Paid.
- **Late Paid** on a Failed or Withdrawn line needs a reference match. A dead line has the same amount as the bill's newer line, so an amount match would raise false Paid-twice alarms.
- **Duplicates:** a second, different debit with the same reference flags the line Paid twice. A statement line repeated on overlapping statements counts once. An undone statement Paid is remembered as rejected for that pairing and never re-settled.
- **Marking by hand** stays available on any Sent line. A later reference match on a line already settled attaches as evidence only; it never settles twice.
- **Unmatched:** a Sent line is *Waiting for statement* until a statement for its payer account covers Sent + 5 business days, then *Not on statement*; with no such statement 14 days after Sent, *No statement yet*. Shown, never emailed. Statement debits that match no line (including an unknown `DB` reference) belong to statement-reconciliation leftovers (map #335).
- **Runs** when a statement's reviewed data is saved and when a batch goes Sent, idempotently (the line id is the key). A new small matcher beside `lib/bank-match` reuses its counterparty and tolerance helpers, not `suggestMatches`.

## Considered options

- **Reuse `suggestMatches` with Payment lines as candidates.** Rejected: its weighted score passes on amount alone (0.6 of 0.6), it allows 1% slack, ignores direction and hides ambiguity.
- **Auto-settle a unique amount-and-name match.** Rejected: suppliers paid the same round sum in the same run are common, and a wrong Paid removes the bill from Bill Pay.
- **A date window on reference matches.** Rejected: it produces false "unmatched" on late statements and would miss the late Paid that ADR 0007 must catch.
- **Subset-sum for partial consolidated debits.** Rejected: the first subset that fits is not proof of which lines were paid.
- **A timer for unmatched lines.** Rejected: statements are uploaded by hand, so age proves nothing; absence from a statement covering the date does.

## Consequences

- `StatementLine.direction` is set from which of debit/credit is filled, not the sign (today every line reads "debit").
- Each per-bank file generator states whether its format carries a Batch reference to the payer's statement.
- Confirming a suggestion is Owner-only, like Paid by hand.

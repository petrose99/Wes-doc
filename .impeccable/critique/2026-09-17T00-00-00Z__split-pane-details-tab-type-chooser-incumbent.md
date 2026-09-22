# Critique — incumbent Details-tab document-type chooser (`components/pipeline/document-detail/split-pane.tsx:312-332`, `:485-488`)

Mode: Operate. Read from code on #283 (grilling); evidence for the decision, not a number to beat — the control is being replaced. No capture round.

| # | Heuristic | Score | Evidence |
|---|---|---|---|
| H1 | Visibility of system state | 2 | Optimistic `setDocType(type)` with a toast on failure; no pending state on the chips beyond `disabled`. |
| H2 | Match to the real world | 1 | Asks "What type of document is this?" inside the *Invoices* queue — the queue already asserted the type (#243 d3). The options (Expense · Sale · Bank Statement · Other) are the accounting category, not a type; "Bank Statement" appears as both a queue and an answer. |
| H3 | User control and freedom | 2 | *Change* link (`text-slate-400`, 12px) reopens the question; no way to say "this is not an invoice" — `reclassifyDocumentAction` exists with no UI. |
| H4 | Consistency and standards | 1 | The only ad-hoc control in the tab: chips as bare `<button>`s outside the field-table grammar #252 shipped for every other field; label "Type:" as a pseudo-field row. |
| H5 | Error prevention | 3 | Save review disabled until answered — but the reason is hidden in `title` plus a 12px amber note. |
| H6 | Recognition over recall | 2 | No default shown although `defaultCategory` is known for every type. |
| H7 | Flexibility and efficiency | 2 | Not in the A4.1 field navigation (Enter confirm-and-advance skips it). |
| H8 | Aesthetic and minimalist | 2 | Two visual modes (question vs "Type: Expense Change") for one fact; the prominent mode fights the field list below it. |
| H9 | Error recovery | 2 | "Could not save document type" — no retry, no reason. |
| H10 | Help and documentation | 2 | "Choose Expense or Sale first" names two of four options. |

Total 19/40. Detector-relevant: `text-slate-400` on white for *Change* (≈2.5:1, below AA), no `focus-visible` ring on the chips, no `aria-pressed`/radiogroup semantics, 12px copy in three places.

Resolution on #283: the type question retires on typed queues; the category becomes the field-table row *Direction* (Payable · Receivable); a wrong type is a ⋯ *Move to another queue…* action.

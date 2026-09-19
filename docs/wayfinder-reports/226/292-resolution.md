## Resolution — grilled solo (owner delegation active; every `➡️` taken)

**Facts established before questioning** (`lib/integrations/{bigcapital,xero,quickbooks}`, `prisma/schema.prisma:1276-1427`, `lib/finance/actions.ts:7-127`, `app/(app)/workspaces/[workspaceId]/admin/integrations/page.tsx`, `lib/config.ts:233-446`, `app/(app)/workspaces/[workspaceId]/layout.tsx:91-105`): the data model is already provider-agnostic — one `IntegrationConnection` row per `(workspaceId, provider)`, `finance/actions.ts` already resolves "the" connection generically (any active connection, oldest first) and labels it from `PROVIDER_LABELS`. `IntegrationsManager` already lets a workspace connect Xero or QuickBooks by choice/OAuth. The one place Bigcapital is *not* just a connector: it auto-provisions for **every** workspace with no client choice (`admin/integrations/page.tsx`'s "Ledger connection" `Panel`, note: *"Every company gets its own isolated ledger organization, created automatically"*), it renders in its own separate `Panel` above `IntegrationsManager` instead of beside Xero/QuickBooks as a fourth option, and the rail's Finance gate + mobile tab gate (`layout.tsx:91,105`) is keyed on `config.integrations.bigcapital.enabled` alone — i.e. today's code already half-agrees with "no primary ledger" and half-contradicts it by special-casing Bigcapital as automatic and gate-defining. CONTEXT.md's **Built-in ledger** entry (line 265) and the Close the books capability (line 306, *"the built-in ledger, connected accounting systems…"*) are the words that still assert a primary.

### Round 1 — Intent `strategize`: the stance

**Q1. Does DocuBite drop "no primary ledger, Bigcapital included as a connector" — yes or stay with Built-in ledger as the default?**
➡️ **Yes, adopt no-primary-ledger.** The architecture already treats connections generically; the only place a primary survives is copy and two gates. Keeping the fiction costs two live defects (the auto-provision-for-everyone step, the Bigcapital-only enable gate) for a claim ("DocuBite has its own ledger") the product doesn't need to make — DocuBite is a document inbox that posts to *the client's* books (the ticket's own framing, and CONTEXT.md's Finance entry: *"its contents belong to Admin › Integrations"*). Visible-intent principle: don't claim a capability (a built-in books-of-record) the product isn't actually providing as the default path.

**Q2. Does Bigcapital survive as an offered connector, or drop from the default set entirely?**
➡️ **Survives, demoted.** It has a full client/mapper (`lib/integrations/bigcapital/*`) matching Xero/QuickBooks's shape — dropping it destroys working capability for no gain. It becomes a fourth named choice (Xero, QuickBooks, Bigcapital — Sage has no client yet, stays fog) a client picks and authorises, exactly like the other two; DocuBite stops auto-creating it.

### Round 2 — Intent `journey`: the connect flow's states

**Q3. What replaces the Provisioning step in the connection surface's state machine?**
➡️ **Not connected → choose provider → authorising → connected · needs reconnect** (the ticket's own proposed set). For Bigcapital, the "authorising" state covers what provisioning used to do silently (the ledger org is created behind that state, not before it) — no user-facing "Provisioning…" word survives; it was always describing DocuBite's plumbing, not the client's action. This retires the `getWorkspaceProvisionJob` status line as a distinct copy state (the job itself can still exist as the mechanism inside "authorising").

**Q4. Does every workspace still get a connection at signup, or does "not connected" become the true starting state?**
➡️ **"Not connected" is the true starting state for every workspace.** No connector is created until a client picks one. This is the concrete change to `admin/integrations/page.tsx`'s provisioning call and to the rail/tab gate.

### Round 3 — Intent `articulate`: provider-neutral vs provider-named copy

**Q5. Is "Post to ledger" / "Posted" / "Open ledger" provider-neutral or does it become "Open in Xero" etc.?**
➡️ **Split by where the client is in the flow.** The *action* vocabulary (Post, Posted, Post failed, Ledger mark, the `Ledger` facet) stays provider-neutral — CONTEXT.md's #281-decided words already are, and they read the same across three providers by design (one queue, one facet, no per-provider branching in the row). The *destination* link, which only ever appears once a specific provider is connected, becomes provider-named: **"Open in Xero" / "Open in QuickBooks" / "Open in Bigcapital"** instead of the generic "Open ledger" — the client picked that provider, naming it is honest, not decoration. Connection-surface status likewise names the provider: "Connected · Acme Ltd (Xero)" not "Connected · Acme Ltd".

**Q6. What happens to the term Built-in ledger?**
➡️ **Retires.** CONTEXT.md's entry is struck; nothing replaces it with a synonym — "the connected ledger" / "the ledger" (generic, whichever provider) is what the rest of the glossary already says (Ledger mark, Finance, Post). The Close the books capability line drops "the built-in ledger,"; it becomes "connected accounting systems and workspace-scoped external systems."

### Round 4 — Impeccable `shape` / `clarify` / `distill`: the connection surface

**Q7. One connector panel or two (today's special Bigcapital `Panel` + `IntegrationsManager`)?**
➡️ **One.** `distill`: cut the separate "Ledger connection" `Panel` and its auto-provisioned framing; fold Bigcapital into `IntegrationsManager`'s card grammar as a third `PROVIDER_LABELS` entry beside Xero and QuickBooks, same connect/disconnect/reconnect affordances. `shape`: the panel's state per connector is Not connected (a "Connect" choice per available provider) → Authorising… → Connected (name, org/tenant, Sync now, Open in ‹Provider›) → Needs reconnect. Only one connector active at a time per workspace stays true (unique index is `[workspaceId, provider]`, not a single-connection constraint, but the push-resolution logic in `finance/actions.ts` picks one — that single-active-connection behaviour is unchanged, only the panel's chrome and the provider list change).

**Q8. Gate fix: what replaces `accountingEnabled = config.integrations.bigcapital.enabled` on the rail and phone tab?**
➡️ **`accountingEnabled` = any provider enabled** (`bigcapital.enabled || xero.enabled || quickbooks.enabled`), matching the "ledger flag off" meaning in #281's spec (*"no action, mark, facet or band"*) — that flag was always meant to mean "no ledger capability at all on this deployment," not "Bigcapital specifically is off."

### Action Summary (for the execution session)

Intent: `strategize` (this stance) → `journey` (connect-flow states) → `articulate` (provider-neutral vs named copy, CONTEXT.md edits). Impeccable: `shape` → `distill` → `clarify`, ending `polish` once built.

**What changes in code (execution ticket, opened below):**
1. `admin/integrations/page.tsx` + `components/accounting/accounting-dashboard.tsx`: remove the standalone "Ledger connection" `Panel` and its auto-provision call; add Bigcapital as a third entry in `IntegrationsManager`'s provider list with a "Connect Bigcapital" affordance that triggers provisioning only on choice.
2. `layout.tsx:91,105` (`accountingEnabled`): switch to `config.integrations.bigcapital.enabled || config.integrations.xero.enabled || config.integrations.quickbooks.enabled`.
3. Deep links: "Open ledger" → "Open in ‹Provider›" wherever a Status line or connection card renders it once connected (`integration-push.ts` / the pane Status line built on #281, and the connection panel).
4. CONTEXT.md: strike **Built-in ledger** (line 265-266); amend the Close the books capability (line ~306) to drop "the built-in ledger,".
5. No change needed to the `Post`/`Posted`/`Ledger mark`/`Ledger` facet words (#281) or to the `IntegrationConnection`/push data model — already provider-neutral.

**Out of scope:** Sage as a fourth connector — no client/mapper exists; stays fog until built. A payments-provider parallel (Bill Pay's payer-account format) is untouched — this decision is about the accounting ledger only.

**Bigcapital hosting note:** DocuBite keeps operating Bigcapital's server as infrastructure it hosts (unchanged), it's the *default/automatic* status that's dropped, not the hosting arrangement.

**Map decisions-so-far line (added to #226):**
[Decide the ledger stance: no primary built-in ledger (#292)](https://github.com/petrose99/Wes-doc/issues/292): Bigcapital demoted to a chosen/authorised connector beside Xero and QuickBooks; Built-in ledger retires; connection surface merges into one provider picker; execution #329.

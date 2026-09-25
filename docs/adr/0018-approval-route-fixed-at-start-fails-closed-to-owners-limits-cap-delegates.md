# An Approval's Route is fixed at start and fails closed to the Owners; Approval limits cap every decision, Delegates included

Approval flows had sequential stages with named approvers and an amount threshold that was stored but never enforced, and every decision re-read the flow's live stages — so editing a flow could make a run in progress skip a stage or fail (`workflow_stage_not_found`), a named approver who had left the company made their stage undecidable, and anyone could approve a run they started themselves (#452, owner, 2026-09-25). Adding Conditions (supplier, Account on any line, amount, type), per-person Approval limits and Delegation made each of those holes wider, so the owner settled how they close.

A stage applies when its **Conditions** hold, and the stages that apply when a run starts are frozen onto it as its **Route**: a later edit to the flow reaches only runs started after it, or a run once it is sent back and restarted. The facts about *people* are read live at each decision — Approval limits, Delegations, and who has left — because they describe who may act now, not what the rule was. Every gap fails **closed to the company's Owners**, never open: an unknown amount makes every amount Condition hold (reversing the old `applicableStages`, which dropped them); a Route with no stage becomes one Owner stage; a stage whose named approvers have all left, or whose limits none cover the amount, passes to the Owners; nothing ever approves itself. The person who started a run never decides it, except the only Owner of a single-Owner company, whose decision is marked Self-approved.

An **Approval limit** caps every decision its holder makes, as themselves or as a **Delegate**: a Delegation hands over who may decide, never a higher limit, and it always ends (no more than 30 days) and never chains.

## Considered options

- **Several flows with entry conditions, first match wins (Ramp's shape).** Rejected: it needs a precedence order and an explanation of which flow won on every row; Conditions on stages extend the existing `minAmount` and a bill's Route is just the stages that hold.
- **Runs follow the live flow.** Rejected: that is the current hazard; an Owner editing a control must not reroute bills already in front of an Approver.
- **Freeze the people too (approvers, limits) at start.** Rejected: a departed approver or an expired Delegation would then hold a bill hostage, and a lowered limit would not bite until every open run drained.
- **Not eligible until an Owner edits the flow, when nobody can decide.** Rejected as a dead end; the Owners already hold the authority the fallback gives them.
- **A Delegate acts with the Delegator's limit.** Rejected: delegation would become the way around limits.

## Consequences

- The run stores its Route (stages, Conditions matched, named approvers) at start; restart re-resolves it. Existing runs are migrated by freezing their flow's current stages.
- A member with no limit set has none, so shipping limits changes nobody's authority until an Owner sets one.
- Limits and amount Conditions are numbers in the company currency and are never converted; if the currency changes before it locks (ADR 0013), the switch lists them.
- PO mismatch approvers and the Owner-approves-batch gate are separate and unchanged. Approval never posts and never pays.

# TaxHacker Product Context

This glossary defines the product language used for the authenticated workspace experience and its document-to-ledger workflow.

## Authenticated workspace experience

**Workspace home**:
The first authenticated surface for a workspace, oriented around the user's next meaningful piece of work.
_Avoid_: Dashboard, landing page

**Next-action queue**:
The permission-filtered set of work items that can move a workspace forward, ordered by blockage, urgency, and financial consequence.
_Avoid_: To-do list, activity feed

**Next best action**:
The single highest-priority item presented to the user, with a concise explanation of why it is currently first.
_Avoid_: Recommendation, suggestion

**Caught-up state**:
The workspace-home state shown when no review, recovery, or placement work is pending; it offers upload and workspace-browsing as secondary actions.
_Avoid_: Empty state, zero state

**Core workflow destinations**:
Documents, Worksheets, Finance, and Archive: the permission-filtered peer surfaces representing intake, computation, booked outcome, and the permanent source record.

**Immersive surface**:
A document-detail or worksheet page that temporarily takes over the viewport while preserving workspace identity, a clear return action, and relevant workspace status.

**Origin context**:
The workspace, list, filters, position, and workflow state from which a user opened a detail or action surface. Returning from that surface restores the origin context whenever it still exists.

**Workflow operation**:
An in-progress or recently completed unit of work such as extraction, sync, review assignment, worksheet placement, approval, or publish. An operation remains discoverable after navigation so the user can understand what happened and what to do next.

**Operation status**:
The user-facing progress and outcome for a workflow operation, shown inline where the operation began and in the workspace activity/status area. It includes the current step, progress when known, and a plain-language next action.

**Partial outcome**:
A batch result in which individual items may succeed, need review, be skipped, be canceled, or fail. Partial outcomes remain visible per item rather than being collapsed into one batch-level success or failure.

**Server-confirmed action**:
An action whose durable or external effect is not treated as complete until the server confirms it, including approvals, ledger pushes, and other financial writes. Local optimistic feedback may precede confirmation only for reversible, low-risk changes.

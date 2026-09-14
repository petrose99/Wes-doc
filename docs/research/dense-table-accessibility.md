# Accessibility limits on dense data tables

Research for Wayfinder #187 (map #177). Question: the Vic.ai-style redesign of DocuBite's
authenticated operator screens commits to high information density, but accessibility is a hard
constraint density may not break. What do the standards actually require?

**Sources: primary only.** W3C WCAG 2.2 Recommendation, its Understanding and Techniques
documents, and the WAI-ARIA Authoring Practices Guide (APG). No blogs, no summary sites.

---

## 1. Target size — SC 2.5.8 (AA) and SC 2.5.5 (AAA)

**SC 2.5.8 Target Size (Minimum), Level AA** —
<https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>

> The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:
> - **Spacing:** Undersized targets (those less than 24 by 24 CSS pixels) are positioned so that if
>   a 24 CSS pixel diameter circle is centered on the bounding box of each, the circles do not
>   intersect another target or the circle for another undersized target;
> - **Equivalent:** The function can be achieved through a different control on the same page that
>   meets this criterion;
> - **Inline:** The target is in a sentence or its size is otherwise constrained by the line-height
>   of non-target text;
> - **User agent control:** The size of the target is determined by the user agent and is not
>   modified by the author;
> - **Essential:** A particular presentation of the target is essential or is legally required for
>   the information being conveyed.

### What the spacing exception actually buys us

This is the exception dense tables live on, and it is generous. A control may be visually 16×16 px
as long as a 24 px diameter circle centred on its bounding box does not intersect any other
target's bounding box or another undersized target's circle. In practice: **a 16 px icon button is
compliant if its centre is at least 24 px from the centre of the next target** (the circles are
radius 12, so centre-to-centre ≥ 24). Padding counts toward the target, and invisible padding
counts — the target is the hit area, not the ink.

Practical rule for the redesign: **row actions may be small, but they must be spaced.** A row of
three 16 px icon buttons packed at 4 px gaps fails. The same three buttons at 24 px centre spacing
passes at AA with no visual change to the icon itself.

### Do small inline controls inside a dense table row qualify for the "inline" exception?

**Almost certainly not.** The inline exception is narrowly scoped: the target must be "in a
sentence" or its size "otherwise constrained by the line-height of non-target text." The
Understanding document's framing is about links embedded in running prose, where reflow makes
target position unpredictable and enlarging links would wreck the text block — "Links within
paragraphs of text do not need to meet the 24 by 24 CSS pixels requirements."

A table cell is not a sentence. An icon button or a chip sitting in a grid cell is constrained by
the author's row height, not by the line-height of surrounding prose — the author chose the row
height, so the author controls the size. **Treat the inline exception as unavailable for row
controls** and satisfy 2.5.8 via the spacing exception instead. The one genuine inline case in a
dense table is a link inside a wrapped text cell (e.g. a vendor note paragraph); a bare link in a
one-line "Vendor" cell is a judgement call and safer to space.

"Essential" is not available either — dense layout is a product preference, not an essential
presentation or a legal requirement.

### What 2.5.5 adds

**SC 2.5.5 Target Size (Enhanced), Level AAA** —
<https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html>

> The size of the target for pointer inputs is at least 44 by 44 CSS pixels except when:
> Equivalent, Inline, User agent control, Essential.

Two differences that matter: the threshold is **44×44** rather than 24×24, and — critically —
**there is no spacing exception at AAA.** Spacing cannot rescue an undersized target under 2.5.5;
the target itself must be 44 px. A dense operator table is structurally incompatible with 2.5.5.

**Recommendation:** target **AA (2.5.8) as the hard floor**, satisfied through the spacing
exception. Do not commit to 2.5.5 for the operator grid. If a AAA claim is wanted anywhere, make it
on low-density surfaces (settings, onboarding, marketing), not the grid.

---

## 2. Reflow — SC 1.4.10 (AA)

<https://www.w3.org/WAI/WCAG22/Understanding/reflow.html>

> Content can be presented without loss of information or functionality, and without requiring
> scrolling in two dimensions for:
> - Vertical scrolling content at a width equivalent to 320 CSS pixels;
> - Horizontal scrolling content at a height equivalent to 256 CSS pixels.
>
> Except for parts of the content which require two-dimensional layout for usage or meaning.

320 CSS px is the width you get from a 1280 px viewport at 400% zoom — the criterion is really
about zoom, not about phones, and it applies to the authenticated app exactly as it applies to
marketing pages.

### How the two-dimensional exception applies to data tables

The Understanding document names data tables explicitly as excepted: data tables and grids have a
genuine two-dimensional relationship between row/column headers and their cells, so a wide table is
allowed to require horizontal scrolling.

**What the exception does NOT cover** — and this is the part that bites a table-centric app:

- It covers **the table itself only**. The Understanding document is explicit that other content
  related to the table — a preceding heading, a search or filter field, pagination controls, bulk
  action bars, toolbars — is **not** excepted and must reflow.
- It does not excuse the **page shell**. The sidebar, top bar, detail panel, filter chips and any
  surrounding chrome must all reflow to 320 px without horizontal scrolling.
- It does not excuse **loss of functionality**. Everything reachable at wide widths must remain
  reachable at 320 px.
- It does not licence the whole page to scroll horizontally as a design convenience. The correct
  implementation is to put the table in **its own scrollable container**, so only the table scrolls
  sideways and everything else reflows. Page-level bidirectional scrolling is tolerated only where
  it is genuinely necessary to view excepted content, and only so long as non-excepted content
  itself needs scrolling in just one direction.

**Practical consequence for the redesign:** a `overflow-x: auto` wrapper around the grid is
mandatory, not optional. The toolbar above it, the filter row, the pagination below it, and the
right-hand detail panel must each collapse/stack at 320 px. A right-hand detail panel that sits
beside the grid at desktop must become a full-width or overlay panel at narrow widths — a
side-by-side split that forces the page to scroll horizontally is a 1.4.10 failure, because the
panel is not part of the table's two-dimensional data relationship.

Column priority (hiding low-value columns at narrow widths) is permitted only if the information
remains available — e.g. in the detail panel — since 1.4.10 forbids "loss of information or
functionality."

---

## 3. Non-text contrast — SC 1.4.11 (AA)

<https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html>

> The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent
> color(s):
> - **User Interface Components:** Visual information required to identify user interface
>   components and states, except for inactive components or where the appearance of the component
>   is determined by the user agent and not modified by the author;
> - **Graphical Objects:** Parts of graphics required to understand the content, except when a
>   particular presentation of graphics is essential to the information being conveyed.

### The 2px coloured underline signalling AI confidence

**Yes — it must meet 3:1 against its background, and colour alone is not enough anyway.**

The underline is not decorative: it is the sole carrier of a state (confidence level) that the
operator is meant to perceive and act on. That puts it squarely inside "visual information required
to identify … states" / "parts of graphics required to understand the content." The Understanding
document's own examples are exactly this shape — "the check in a checkbox, or an arrow graphic
indicating a menu is selected or open must have sufficient contrast to the adjacent colors."

Two additional cautions the standard raises directly:

- **Adjacent colour is the cell background, not the page background.** If rows zebra-stripe or
  highlight on hover/selection, the underline must clear 3:1 against *every* background it can
  appear on, including the selected-row tint.
- **Thin lines under-render.** The Understanding document warns that "due to anti-aliasing,
  particularly thin lines and shapes of non-text elements may be rendered by user agents with a
  much fainter color than the actual color defined in the underlying CSS," and advises avoiding
  thin lines or exceeding the normative requirement. A 2 px underline is thin. **Specify a comfortable
  margin above 3:1 (aim ≥ 4.5:1) rather than landing on 3.05:1**, or thicken the rule.

**What must accompany it:** because the underline distinguishes confidence *levels* by colour, it
also engages SC 1.4.1 (section 4). Colour alone cannot separate high/medium/low. Vary a second
channel — line weight, dash/solid pattern, or a paired glyph — and expose the confidence value in
text or via the accessible name/description of the cell so screen reader users get it at all. A
purely visual underline is invisible to a screen reader no matter how well it contrasts.

### The per-cell "=" / "≠" match/mismatch glyph

**Also yes — 3:1 required — but with a wrinkle worth getting right.**

"=" and "≠" are typographic characters. If they are rendered as *text* (a real character in the
DOM), they are governed by **SC 1.4.3 Contrast (Minimum)**, which for small text demands **4.5:1**,
a stricter bar than 1.4.11 — so rendering them as text does not let you off, it raises the floor.
If they are rendered as an SVG or icon-font glyph functioning as a graphic, 1.4.11 applies at 3:1.
Either way the mark carries meaning the operator must perceive, so no exception applies: it is not
inactive, not user-agent-determined, not decorative, and its particular presentation is not
essential.

**Design rule: hold both glyph forms to 4.5:1.** It is the stricter of the two possible criteria,
it removes the text-vs-graphic argument entirely, and it is the safer call for a 10-12 px glyph.

**What must accompany it:** a text alternative. The glyph is a graphic conveying information, so
SC 1.1.1 requires a text equivalent — `aria-label`/visually-hidden text on the cell such as
"Matches purchase order" / "Does not match purchase order". "=" and "≠" also differ from each other
by a single thin stroke, which is a real legibility problem at grid glyph sizes: pair the symbol
difference with a shape or colour difference too, so the distinction survives low vision and poor
rendering.

---

## 4. Colour alone — SC 1.4.1 (A)

<https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html>

> Color is not used as the only visual means of conveying information, indicating an action,
> prompting a response, or distinguishing a visual element.

This is **Level A** — the lowest, most basic conformance tier. There is no exception clause. It is
the least negotiable item on this page.

### The status-by-colour row icon

A coloured dot or pill that encodes row status fails 1.4.1 if colour is the only differentiator.
It must carry **at least one non-colour channel**:

- **Shape or symbol** — a distinct glyph per status, not the same circle in five colours
  (technique G111, combining colour and pattern; G182, providing additional visual cues).
- **Text** — the status word, either visible or, at minimum, as an accessible name (technique G14,
  ensuring information conveyed by colour is also available in text).

Note that contrast is a separate, additive requirement: the Understanding document is explicit that
meeting a contrast ratio does not satisfy 1.4.1 — "knowing whether an outline is green for valid or
red for invalid" still needs an extra indicator regardless of contrast. Conversely, a lightness
difference of at least 3:1 *between* the two colours can itself count as a non-colour cue, since it
survives greyscale.

**Recommended pattern for the grid:** one glyph shape per status + accessible text name, with
colour as reinforcement only. A useful acceptance test: **screenshot the grid, desaturate it to
greyscale, and confirm every status is still distinguishable.**

### The colour-coded countdown badge — blue "12 Days Away" / purple "Expires in 3 Days" / red "4 Days Overdue"

This example **already passes 1.4.1 on its face**, and it is worth saying so plainly rather than
flagging it reflexively: each badge carries its own distinct text, and the text alone
("12 Days Away" vs "Expires in 3 Days" vs "4 Days Overdue") fully conveys the state without any
colour. Colour is redundant reinforcement. That is exactly what G14 asks for.

The badges do still owe three things:

1. **1.4.3 Contrast (Minimum):** the badge *text* needs 4.5:1 against the badge fill (3:1 if the
   text is ≥ 18.66 px bold or ≥ 24 px). Light text on a saturated blue/purple/red pill is the usual
   place this quietly fails — check each of the three combinations.
2. **1.4.11:** if the badge has a border or outline that is load-bearing for identifying it as a
   component, that outline needs 3:1. A filled pill whose fill differs from the row background by
   ≥ 3:1 is fine.
3. **Don't shorten the label to the number.** The pass depends entirely on the text staying
   descriptive. A truncation-to-"12" at narrow widths, or an icon-only variant, converts a passing
   badge into a 1.4.1 failure. **Preserve the word content at every breakpoint** — this is the one
   real risk here, and it collides directly with the density goal.

---

## 5. Tables and assistive tech — APG guidance

### Which pattern

Two APG patterns are in play and choosing between them is the first decision:

- **Table pattern** — <https://www.w3.org/WAI/ARIA/apg/patterns/table/> — "Like an HTML `table`
  element, a WAI-ARIA table is a static tabular structure containing one or more rows that each
  contain one or more cells; it is not an interactive widget."
- **Grid pattern** — <https://www.w3.org/WAI/ARIA/apg/patterns/grid/> — "used to make an
  interactive widget that has a tabular structure."

**The DocuBite operator table is a grid, not a table.** Rows are selectable, cells contain
controls, rows open a detail panel. The APG makes the practical argument directly: replacing a
table that contains many interactive widgets with a grid dramatically shortens the page tab
sequence, because a grid is a composite widget that manages focus internally. In a dense AP queue
with 50 rows × 3 controls, a plain table costs 150 tab stops; a grid costs **one**.

Use native `<table>` markup with ARIA grid roles layered on (`role="grid"` on the table,
`role="row"`, `role="gridcell"`, `role="columnheader"`, `role="rowheader"`), so semantics survive if
scripting fails. The grid needs an accessible name via `aria-label` or `aria-labelledby`.

### Keyboard model (APG grid pattern)

- **Roving tabindex**: exactly one element inside the grid is in the page tab sequence. Tab enters
  and leaves the grid; it does not walk the cells.
- **Arrow keys** move between cells — Left/Right within a row, Up/Down across rows.
- **Home/End** move to first/last cell in a row; **Control+Home/End** to the first/last cell in the
  grid.
- Where a cell contains a single interactive widget, grid navigation sets focus on that widget
  directly; where the cell holds text or a graphic, focus lands on the cell.
- Data grids should **not wrap** at row boundaries (wrapping is optional and is a layout-grid
  behaviour); predictable boundary behaviour is the guidance.

### Sortable column headers

- `aria-sort` goes **on the `columnheader` (the `th`) of the currently sorted column**, not on the
  sort button inside it.
- Allowed values (per the APG Grid and Table Properties practice,
  <https://www.w3.org/WAI/ARIA/apg/practices/grid-and-table-properties/>): **`ascending`**,
  **`descending`**, **`other`**, **`none`** (default, no sort applied).
- **Only one column carries a non-`none` value at a time.** The practice states plainly that "ARIA
  does not provide a way to indicate levels of sort for data sets that have multiple sort keys,"
  so applying a non-`none` value to more than one column has limited value. **If the redesign wants
  multi-column sort, ARIA cannot express it** — the sort order must be conveyed in text (e.g. a
  visible "Sorted by Due date, then Vendor" summary, and per-header text), not via `aria-sort`
  alone. This is a live constraint on the design, not a footnote.
- Make the header's clickable region a real `<button>` inside the `th` so it is operable and
  announces as an activatable control; the sort state lives on the `th` via `aria-sort`.
- Announce the result of a sort (row count and new order) via a polite live region — reordering
  rows is a content change the user initiated but cannot see if they are not looking at the grid.

### Row selection

- Selected rows carry **`aria-selected="true"`** (on the `row` for row selection, on the
  `gridcell` for cell selection). Unselected rows in a selectable grid should carry
  `aria-selected="false"` so the state is perceivable as a state rather than absent.
- The grid carries **`aria-multiselectable="true"`** when more than one row can be selected at once.
- APG keyboard conventions for multi-select: **Shift+Space** selects the row, **Shift+Arrow**
  extends the selection, **Control+A** selects all.
- If selection is expressed with checkboxes in a leading column (the likely DocuBite pattern), the
  checkboxes need accessible names identifying the row ("Select invoice INV-1042 from Acme Ltd"),
  not a bare "Select".
- Selection state must not be colour-only — see SC 1.4.1 above. A tinted row needs a checked
  checkbox, a left border, or another non-colour cue.

### Virtualised / paginated rows

If rows are windowed for performance, set **`aria-rowcount`** on the grid to the true total and
**`aria-rowindex`** on each rendered row; likewise `aria-colcount`/`aria-colindex` if columns are
virtualised. The APG carries a hard warning: invalid or inconsistently applied index values "could
cause screen reader table reading functions to skip rows or simply stop functioning." Indices are
1-based, must increase monotonically, must not exceed the declared count, and for a spanning cell
must be set to the first position in the span. **Half-implemented `aria-rowindex` is worse than
none.**

### Announcing that a row click opened the right-hand detail panel, without destructively moving focus

This is the question with the least direct APG text, so here is the reasoning chain and what it
supports.

**First: is moving focus even allowed?** Per SC 3.2.2 On Input
(<https://www.w3.org/WAI/WCAG22/Understanding/on-input.html>), "Changing the setting of any user
interface component does not automatically cause a change of context unless the user has been
advised of the behavior before using the component," and a change of context includes a change of
focus. The Understanding document also notes "a change of content is not always a change of
context" — an expanding outline or tab control does not necessarily change context "unless they
also change one of the above (e.g., focus)." Activating a control (clicking a row) is not
"changing a setting," so 3.2.2 does not strictly forbid moving focus here. But **auto-moving focus
to the panel is still the wrong design for this product**: a bookkeeper arrowing down 200 rows to
triage would be yanked out of the grid on every row change, losing their place. Keep focus in the
grid.

**So: keep focus, announce the change.** The mechanism is a combination, and each part does a
distinct job:

1. **`aria-expanded`** on the row (or on the row's activating control) — `true` when that row's
   detail is open, `false` when closed. This is the APG disclosure pattern's core state attribute:
   "When the content is visible, the element with role `button` has aria-expanded set to `true`.
   When the content area is hidden, it is set to `false`"
   (<https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/>). It makes the open/closed state
   *queryable* — a screen reader user who returns to the row later is told it is expanded.
2. **`aria-controls`** on the same element, referencing the detail panel's `id`. The disclosure
   pattern lists this as optional, and support is uneven across screen readers, but it is the only
   declarative statement of the relationship and costs nothing.
3. **A polite live region announcing what opened.** The panel itself should be a landmark
   (`role="region"` or `<aside>`) with an accessible name that names the row —
   `aria-label="Details: INV-1042, Acme Ltd"` — and a `role="status"` / `aria-live="polite"`
   element should announce e.g. "Details panel opened for invoice INV-1042." `polite`, never
   `assertive`: in a grid where the user may arrow through rows quickly, an assertive region
   interrupts every keystroke and is unusable. Use `aria-atomic="true"` so the whole message is
   read rather than the diff. Debounce the announcement so rapid arrow-key traversal does not
   queue dozens of messages.
4. **Give the user an explicit, advertised way in.** The panel must be reachable deliberately —
   the APG grid convention is **F6** to move between panes of a composite widget, or provide a
   "View details" control in the row whose activation *does* move focus (activation-initiated focus
   movement is expected and fine). The panel needs a documented way back to the row it came from,
   and its close control must return focus to the originating row.

**What not to do:** do not make the panel `aria-live` in its entirety — a whole detail panel read
aloud on every arrow-down is the classic overuse failure. Announce a short summary; let the user
navigate in for the detail.

---

## Summary of hard constraints for the redesign

| # | Constraint | Level | Density impact |
|---|---|---|---|
| 1 | Row controls ≥ 24 px targets **or** 24 px centre-to-centre spacing (2.5.8) | AA | Small icons OK; tight packing is not. Inline exception unavailable. |
| 2 | 2.5.5 (44 px, no spacing exception) | AAA | Not achievable in a dense grid — do not claim it |
| 3 | Grid in its own `overflow-x` container; all surrounding chrome reflows at 320 px (1.4.10) | AA | Toolbar, filters, pagination, detail panel must stack |
| 4 | Confidence underline ≥ 3:1 (aim 4.5:1, thin-line caution) + non-colour channel + text value | AA | Cheap; just needs token discipline |
| 5 | "=" / "≠" glyphs ≥ 4.5:1 + text alternative + shape difference | AA | Cheap |
| 6 | Status icons need shape or text, not colour alone (1.4.1) | **A** | One glyph per status, greyscale test |
| 7 | Countdown badges keep their full text at every breakpoint | **A** | Collides with density — no icon-only or numeral-only variant |
| 8 | `role="grid"` + roving tabindex, not a table of 150 tab stops | APG | Improves density usability |
| 9 | `aria-sort` on the `th`, one column only; multi-sort must be conveyed in text | APG | Constrains multi-sort design |
| 10 | `aria-selected` + `aria-multiselectable`; selection not colour-only | APG + A | — |
| 11 | Row click: keep focus in grid; `aria-expanded` + `aria-controls` + polite `role="status"`; named panel landmark; F6 or explicit control to enter it | APG + AA | — |

## Sources

- SC 2.5.8 Target Size (Minimum): <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
- SC 2.5.5 Target Size (Enhanced): <https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html>
- SC 1.4.10 Reflow: <https://www.w3.org/WAI/WCAG22/Understanding/reflow.html>
- SC 1.4.11 Non-text Contrast: <https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html>
- SC 1.4.1 Use of Color: <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html>
- SC 3.2.2 On Input: <https://www.w3.org/WAI/WCAG22/Understanding/on-input.html>
- APG Table pattern: <https://www.w3.org/WAI/ARIA/apg/patterns/table/>
- APG Grid pattern: <https://www.w3.org/WAI/ARIA/apg/patterns/grid/>
- APG Disclosure pattern: <https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/>
- APG Grid and Table Properties practice: <https://www.w3.org/WAI/ARIA/apg/practices/grid-and-table-properties/>
- WCAG 2.2 Recommendation: <https://www.w3.org/TR/WCAG22/>

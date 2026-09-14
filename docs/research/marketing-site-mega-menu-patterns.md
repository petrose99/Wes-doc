# Marketing-site mega-menu patterns

Ticket: [#160 — Mega-menu structure, interaction and accessibility patterns on peer sites](https://github.com/petrose99/docubite/issues/160) (Map [#157](https://github.com/petrose99/docubite/issues/157))

Research date: 2026-09-14

## Executive finding

DocuBite should implement the Product and Solutions panels as disclosure navigation, not as an ARIA `menubar`. Use semantic navigation lists, a real top-level link for each overview page, and a separate disclosure button for each panel. Support activation by click, `Enter`, and `Space`; if desktop pointer opening is retained, make it a progressive enhancement with a short intent delay and a grace period between the trigger and panel. `Escape`, moving focus out of the navigation, and outside pointer interaction must close the panel predictably.

On mobile, the peer pattern is a hamburger-controlled navigation region containing accordion-style disclosure buttons. The panel can be a drawer or full-width block, but the information architecture and link order should remain the same.

## Method and evidence boundary

The current public homepages of Ramp, Vic.ai, and Mercury were inspected on 2026-09-14. Their rendered accessibility trees were used to verify top-level control semantics, `aria-expanded` state, panel grouping, and mobile control markup. Their public page content was used for the visible grouping and link inventory. W3C APG/WCAG and Radix’s own documentation provide the normative and implementation guidance.

Pointer-hover timing and a geometric “safe triangle” are implementation details that are not exposed in the peers’ public content. The findings below therefore distinguish observed DOM behavior from recommended interaction behavior; no claim is made that a peer uses a particular hover algorithm unless its own component documentation says so.

## 1. Peer column structure

### Ramp

Ramp’s current Products panel is grouped into four labelled sections: **Card & Expense**, **Procure to Pay**, **Banking and More**, and **Platform**, followed by a **Featured** region. The first three sections carry short descriptions on their links; Platform is a denser set of product/platform links. The live panel contained roughly 3, 3, 2, and 9 links respectively, plus the featured card.

Its Solutions panel separates platform capabilities from partner-oriented content, and its Resources panel includes both content and free tools. This is a high-density example: the grouping prevents the panel from becoming one undifferentiated wall.

Source: [Ramp homepage](https://ramp.com/), current rendered navigation and footer inventory.

### Vic.ai

Vic.ai’s Products panel uses three visual columns:

- Accounts Payable, with Invoice Processing, PO Matching, Approvals, and AP Inbox;
- Bill Pay and Vendor Portal, Expense Management, and Analytics and Insights;
- an Autonomous Finance Platform group with How It Works, ERP Integrations, Trust and Security, and VicAgents.

Its Solutions panel is explicitly three-column: **By Use Case** (five links), **By Role** (three), and **By Industry** (four). Resources similarly separates a Resource Center feature from Learn and Connect link groups, then adds Blog and Product Tour as feature cards.

Source: [Vic.ai homepage](https://www.vic.ai/), current rendered navigation and footer inventory.

### Mercury

Mercury’s Products panel is organized around five product families: Business Banking, Cards & Spend Management, Payments & Invoicing, Intelligence, and Personal Banking. The first four carry a one-line explanation and nested links; Personal Banking is a single product link. Solutions has a featured set of audience/industry cards plus an “& More” group. Resources is split into Blog, Perks, and Tools, each with “Jump to” links. About is split into overview, connect, and support groups.

Source: [Mercury homepage](https://mercury.com/), current rendered navigation content.

### Reusable pattern

The three peers converge on the same structure:

1. A small number of named groups rather than a flat link wall.
2. Three or four desktop columns for the main panel.
3. Short descriptions only where they help distinguish a capability; not every link needs a paragraph.
4. A featured/CTA area is optional, not a requirement. It is useful when the menu has one current story or overview to promote.
5. Group labels describe the visitor’s mental model (Card & Expense, By Role, Platform), not internal code or team ownership.

For DocuBite, the panel should stay within the same density range as Vic.ai’s Products/Solutions panels. A short lede and one-line descriptors are enough; the capability pages carry the depth.

## 2. Trigger, opening, and dismissal

### What the live peers expose

All three sites expose desktop mega-menu triggers as buttons rather than bare links:

- Ramp: `Products`, `Partners`, `Solutions`, and `Resources` are buttons with `aria-expanded`; activating Products changed it to expanded and revealed the panel. The top-level trigger itself has no destination in the observed header. The product overview is available as a separate link elsewhere on the page.
- Vic.ai: `Why Vic.ai?`, `Products`, `Solutions`, `Resources`, and `Company` are Webflow dropdown buttons with `aria-expanded`. The top-level triggers are not header links; the product pages are links inside the panel.
- Mercury: `Products`, `Solutions`, `Resources`, and `About` are buttons with `aria-expanded`; `Pricing` is a direct link. Its top-level category triggers are not overview links in the observed header.

Sources: [Ramp](https://ramp.com/), [Vic.ai](https://www.vic.ai/), and [Mercury](https://mercury.com/). These observations describe the current public implementations, not an endorsement of every behavior they ship.

### Pointer intent and the safe-triangle problem

Ramp’s rendered trigger IDs identify Radix Navigation Menu primitives. Radix documents `delayDuration` with a default of **200 ms** and `skipDelayDuration` with a default of **300 ms**, specifically exposing custom timing for navigation-menu transitions. This is the closest primary-source evidence for the common “hover intent” and “do not immediately switch panels while crossing the gap” behavior. The page does not prove whether Ramp overrides those defaults.

Source: [Radix Navigation Menu](https://www.radix-ui.com/primitives/docs/components/navigation-menu).

The safe-triangle problem is the diagonal pointer path from a top-level trigger toward a panel: the pointer can briefly cross a neighboring trigger, causing the wrong panel to open or the intended panel to close. If DocuBite supports pointer opening, use an intent delay and a short skip/grace interval between panels, and keep the panel open while the pointer is over either trigger or content. Do not make pointer hover the only way to discover or operate the menu.

W3C’s WCAG 2.2 guidance makes the requirements clearer than the visual metaphor: hover/focus content must be **dismissible**, **hoverable**, and **persistent**. `Escape` is the appropriate dismissal mechanism when the panel obscures content; the pointer must be able to move into the panel without it disappearing; and the panel must remain visible long enough to perceive and use it. Source: [WCAG 2.2 — Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).

### Recommended DocuBite behavior

- Canonical open action: click, `Enter`, or `Space` on the disclosure button.
- Optional desktop enhancement: pointer-open after a short intent delay; no hover-only dependency.
- Keep the panel open while the pointer is over the trigger or panel.
- Close on `Escape`, outside pointer interaction, activation of a destination link, and when focus leaves the navigation region.
- On `Escape`, return focus to the disclosure button that opened the panel.
- Keep only one top-level panel open at a time.
- Do not navigate merely because focus lands on a trigger. W3C’s On Focus guidance says focus must not unexpectedly change context; activation should be explicit. Source: [WCAG 2.2 — On Focus](https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html).

## 3. Top-level overview links

DocuBite’s decided Product model requires `/product` to be a real overview page and the Product label to remain useful as a destination. The accessible solution is not to overload one element with two jobs. Use a top-level link and a separate adjacent disclosure button, both visibly associated with the same bucket:

```text
Product  [v]
```

The W3C APG’s “Disclosure Navigation Menu with Top-Level Links” example uses exactly this hybrid: each list item contains a top-level link and an associated disclosure button. `Tab` moves through both, `Enter`/`Space` activates the button, and `Escape` closes the panel and returns focus to its button. Source: [W3C APG — Disclosure Navigation Menu with Top-Level Links](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation-hybrid/).

Use the same pattern for Solutions if `/solutions` is an overview destination. Resources can use a direct `/resources` link plus a disclosure button if the post/category links are kept in the menu. Pricing and About can remain direct links when they have no child panel.

## 4. Keyboard and screen-reader pattern

### Prefer disclosure navigation for this site

W3C explicitly cautions that ordinary site navigation should not use the WAI-ARIA `menu` role merely because it is colloquially called a menu. The disclosure-navigation example uses semantic lists and buttons because typical site navigation does not need the composite-widget keyboard behavior expected by assistive technologies. Source: [W3C APG — Disclosure Navigation Menu](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/).

The APG `menubar` pattern is valid for a true application-style menubar, but it creates a heavier contract: roving focus, arrow-key navigation, `menuitem` roles, managed focus inside the menu, and `Tab` moving out of the composite rather than through every link. Sources: [W3C APG — Menu and Menubar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) and [WCAG 2.2 — Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html).

### Contract for the implementation

- Wrap the primary links in a named `<nav>` landmark.
- Use semantic `<ul>`/`<li>` structure for top-level groups and nested link lists.
- Use a real `<button>` for each disclosure control.
- Give each button an accessible name, `aria-expanded="false|true"`, and `aria-controls` pointing to its panel.
- Keep the panel’s links in normal tab order; do not hide them behind a custom roving-tabindex menubar model.
- `Tab` and `Shift+Tab` must reach top-level links/buttons and, when open, all links in the panel in a meaningful order.
- `Enter` and `Space` toggle a disclosure button; activating a link navigates.
- `Escape` closes the active panel and restores focus to its trigger.
- Mark the current destination with `aria-current="page"` where applicable.
- Optional `Arrow`, `Home`, and `End` support may make desktop navigation faster, but it must supplement, not replace, normal tabbing. Source: [W3C APG disclosure keyboard support](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/).

This satisfies WCAG 2.1.1’s requirement that functionality be operable by keyboard and WCAG 2.4.3’s requirement that focus order preserve meaning and operability. Sources: [Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) and [Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).

## 5. Mobile pattern

The current peers all include a mobile-specific hamburger control and retain the same grouped information as accordion/disclosure sections:

- Ramp exposes a `Toggle navigation menu` control and mobile-hidden disclosure buttons for Products, Partners, Solutions, and Free tools and resources.
- Vic.ai exposes a `menu` hamburger control and mobile dropdown toggles for Why Vic.ai?, Products, Solutions, Resources, and Company.
- Mercury exposes `Open Menu` plus mobile accordion buttons for Products, Solutions, Resources, and About.

Sources: current DOM inspection of [Ramp](https://ramp.com/), [Vic.ai](https://www.vic.ai/), and [Mercury](https://mercury.com/).

DocuBite should use a hamburger-controlled full-width panel or drawer with accordion sections, not a separate mobile taxonomy. Keep the same five buckets and link order, allow the open section to be reached and operated with touch and keyboard, and ensure the close button, `Escape`, and focus return behavior are explicit. A sheet is a visual container choice; the accessibility contract remains disclosure navigation.

## Action summary for the implementation tickets

1. [09 — Build the nav](https://github.com/petrose99/docubite/issues/166) should implement disclosure navigation with a Product/Solutions top-level link plus adjacent disclosure button, not an ARIA menubar.
2. Use grouped columns with short descriptions and at most one featured region; avoid the flat anchor list currently in `components/marketing/nav.tsx`.
3. Preserve the panel while moving from trigger to content; if pointer-open is enabled, start from Radix’s 200 ms / 300 ms timing model and tune against the craft floor.
4. Audit keyboard focus order, `Escape`, outside-click/focus dismissal, `aria-expanded`, `aria-controls`, `aria-current`, and mobile accordion behavior before closing the build ticket.
5. The final browser audit should test both pointer and keyboard paths at desktop and mobile widths. W3C warns that APG examples are illustrative and that assistive-technology/browser combinations still require testing.


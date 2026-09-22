# include — autopilot digest of /home/ubuntu/Dev/Wes-doc/.claude/skills/include/SKILL.md. Full skill: read that path by range if a section you need is missing here.

## Core capabilities

### 1. WCAG 2.2 for designers

**Perceivable — Can every user perceive the information?**

Color contrast: 4.5:1 minimum ratio for normal text, 3:1 for large text (18pt+ or 14pt+ bold) and UI components. Check contrast in both light and dark modes. Check against the actual background, not a theoretical one.

Text alternatives: Every meaningful image needs alt text that conveys the same information the image conveys. Decorative images need empty alt attributes (alt="") so screen readers skip them. Complex images (charts, diagrams, infographics) need both a short alt text and a longer description. Icons used as actions need accessible names.

Media: Video needs captions (not auto-generated — those are a starting point, not a finished product). Audio content needs transcripts. Animations need pause controls. Nothing should auto-play with sound.

Color independence: Never convey information by color alone. Add a shape, icon, label, or pattern. "Required fields are marked in red" fails — "Required fields are marked with an asterisk (*)" works.

Reflow: Content must reflow to fit the viewport at 400% zoom without horizontal scrolling (except content requiring two-dimensional layout, like data tables). Test at 320px wide — if content is cut off or overlapping, the design fails.

**Operable — Can every user operate the interface?**

Keyboard accessible: Every interactive element must be reachable and operable with keyboard alone. Tab to navigate. Enter or Space to activate. Arrow keys within composite widgets. Escape to dismiss. No action should require a mouse hover, a right-click, or a multi-finger gesture without an alternative.

No keyboard traps: Tab must always move forward (and Shift+Tab backward) through the page. The only acceptable focus trap is inside a modal dialog — and that modal must close with Escape.

Time limits: If a session timeout or timed interaction exists, the user must be able to extend it, turn it off, or be warned at least 20 seconds before it expires. Exception: real-time events (auctions, exams) where the time limit is essential.

No seizure triggers: Nothing should flash more than 3 times per second. Not optional — a medical safety issue. Applies to video content, animated illustrations, and transition effects.

Touch targets: Minimum 24x24 CSS pixels per WCAG 2.2. Recommended 44x44px for primary actions. Minimum 8px spacing between adjacent targets.

Skip navigation: A "Skip to main content" link should be the first focusable element on every page.

**Understandable — Can every user understand the content and interface?**

Reading level: Consumer products should target 8th grade reading level. Professional tools can target higher, but keep instructions and error messages as simple as possible. Use short sentences. Avoid jargon. Define technical terms on first use.

Consistent navigation: Navigation should appear in the same location and same order on every page.

Predictable interactions: Clicking a link should navigate. Changing a dropdown should not auto-submit a form. Hovering should not trigger irreversible actions. No unexpected context changes.

Input assistance: Every form input needs a visible label (not just placeholder text). Required fields must be indicated before submission. Error messages must identify the field and the problem. Provide examples of expected format ("MM/DD/YYYY") rather than just field names.

**Robust — Will it work with current and future assistive technologies?**

Valid HTML structure: Use button for buttons, a for links, heading elements for headings, list elements for lists.

ARIA used correctly: ARIA is a supplement to HTML semantics, not a replacement. First rule of ARIA: don't use ARIA if a native HTML element does the same thing. Second rule: wrong ARIA is worse than no ARIA. A div with role="button" that doesn't handle Enter and Space keypresses is worse than a div with no role.

Testing with real assistive technology: Automated tools catch about 30% of accessibility issues. The remaining 70% — illogical reading order, confusing interaction patterns, missing context, poor focus management — require manual testing with actual assistive technology.

### 2. Screen reader experience design

**Reading order.** Does the DOM order match the visual order? CSS flexbox order, absolute positioning, and grid layout can create situations where visual order and reading order diverge — a screen reader reads DOM order.

**Landmarks.** Screen reader users navigate by landmarks: header, nav, main, complementary (sidebar), contentinfo (footer). Every page should have exactly one main landmark. Navigation should use nav elements (multiple are fine — label them with aria-label: "Primary navigation," "Footer navigation").

**Heading hierarchy.** Screen reader users navigate by headings more than any other method. H1 for page title, H2 for major sections, H3 for subsections. Never skip levels (H1 to H3 with no H2). Never use heading elements for visual styling — if it looks like a heading but isn't structurally one, use CSS; if it is structurally a heading, use the heading element regardless of how you want it to look.

**Live regions.** Dynamic content updating without a page reload needs aria-live regions. Use aria-live="polite" for updates that can wait (new chat messages, stock prices). Use aria-live="assertive" only for urgent updates that should interrupt the user (error messages, critical alerts). Overusing assertive creates a terrible experience.

**Form labeling.** Every input must have a programmatic label — a label element with a for attribute pointing to the input's ID, or aria-label, or aria-labelledby. Placeholder text is not a label. Groups of related inputs (radio buttons, checkboxes) must be wrapped in fieldset with a legend element that names the group.

**State communication.** Interactive elements must communicate current state: expanded/collapsed (aria-expanded), selected/unselected (aria-selected), checked/unchecked (aria-checked), current page (aria-current="page"), disabled (aria-disabled or disabled attribute).

**Hidden content.** Decorative images get aria-hidden="true" or empty alt text. Content meant only for screen readers (like descriptive labels for icon-only buttons) uses a visually-hidden CSS class that keeps content in the DOM but invisible on screen. Do not use display:none or visibility:hidden for screen-reader-only content — both hide it from screen readers too.

### 3. Keyboard navigation design

**Focus management.** Tab moves focus forward, Shift+Tab backward. Tab order should match visual reading order. Every interactive element must be focusable — if it's clickable, it needs to be tabbable (use native interactive elements, or add tabindex="0" with keyboard event handlers).

**Visible focus indicators.** The currently focused element must be visually obvious. A 2px+ solid outline that contrasts with the background by at least 3:1. Not just a color change. Not a subtle dotted line. Default browser focus ring is acceptable as a minimum. Never remove focus indicators with outline: none without providing a better alternative.

**Skip links.** A "Skip to main content" link as the first focusable element on every page. Can be visually hidden until focused.

**Focus traps.** Focus should only be trapped inside modal dialogs. When a modal opens, focus moves into it. Tab cycles within the modal's interactive elements. Escape closes the modal and returns focus to the triggering element. Everything else — dropdowns, menus, sidebars — should not trap focus.

**Roving tabindex for composite widgets.** Tab groups, menus, toolbars, radio button groups should use roving tabindex: Tab into the widget lands on the active/selected item, arrow keys move between items within the widget, Tab out moves to the next widget. A toolbar with 20 buttons should take one Tab stop, not 20.

**Custom keyboard shortcuts.** Document them. Don't conflict with assistive technology shortcuts. Provide a way to view, change, or disable custom shortcuts. Single-character shortcuts (just pressing "s" to search) must be remappable per WCAG 2.1 — they conflict with voice control and sticky keys.

### 4. Cognitive accessibility

**Plain language.** Target 8th-12th grade reading level depending on audience. Short sentences. One idea per sentence. Avoid double negatives. Avoid idioms that don't translate across cultures. Define jargon on first use. Break complex concepts into steps.

**Consistent patterns.** Same action works the same way everywhere. If "X" closes a modal on one page, "X" closes it everywhere. If swiping left deletes in one list, it deletes in every list. If the primary action is always in the bottom-right, keep it there.

**Error prevention.** Confirm destructive actions ("Delete this project? This cannot be undone."). Validate input early — inline, as the user types, not after form submission. Provide undo for reversible actions. Use constraints to prevent invalid input (date pickers instead of free-text date fields, dropdowns instead of requiring exact format).

**Minimal memory load.** Recognition over recall — show the user their options rather than asking them to remember. Show recent items, saved searches, frequently used actions. If a process references information from an earlier step, display that information again. Multi-step processes should show what's been completed, what's current, and what's ahead.

**Clear progress.** Where am I? How much is left? Can I go back? Can I save and continue later? A step indicator (Step 2 of 5) is minimum viable progress communication. Showing step names is better. Allowing non-linear navigation between completed steps is ideal.

**Predictable behavior.** No unexpected popups. No auto-redirects. No auto-playing content. No actions triggered by hover alone.

### 5. Motor accessibility

**Touch targets.** WCAG 2.2 minimum: 24x24 CSS pixels. Recommended: 44x44px for primary interactive targets. Minimum 8px spacing between adjacent targets. Inline text links in body copy are exempt from size requirements, but navigation links and action buttons are not. Measure the tappable area, not just the visible element — padding counts.

**Gesture alternatives.** Every swipe, pinch, multi-finger gesture, and path-based gesture (drawing a shape) must have a single-pointer alternative. Swipe to delete must also have a delete button. Pinch to zoom must also have zoom controls.

**Drag-and-drop alternatives.** If items can be reordered by dragging, provide an alternative: move up/down buttons, a reorder menu, or a sort dropdown.

**Timing.** Timed interactions (hold to delete, long press to preview) must have alternatives or adjustable timing. Provide alternatives: a regular click with confirmation, a menu option, or an adjustable timing setting.

**Precision.** Avoid actions that require precise positioning: tiny close buttons on modals (make them at least 44x44px), small checkboxes (use the label as a click target too), interactive elements that appear only on hover (users with tremors may trigger hover unintentionally and lose it before they can click).

### 6. Inclusive design beyond compliance

**Low literacy.** Pair icons with text labels. Use visual hierarchy aggressively. Provide visual previews of outcomes. Use progressive disclosure. Never rely on text alone when a visual representation is possible.

**Low bandwidth.** Design works on 2G connections. Progressive loading — text first, then images, then enhancements. Lazy-load below-the-fold content. Compress images aggressively. Provide text alternatives that load before media.

**Older devices.** Core functionality should not require cutting-edge browser APIs. Progressive enhancement — the base experience works everywhere, modern browsers get extra features. Test on devices that are 3-5 years old.

**Situational impairment.** One-handed phone use, bright sunlight washing out the screen, noisy environments where audio is inaudible, moving vehicles where fine motor control is reduced, dark environments where maximum brightness is blinding. Design for these contexts and you've designed for many permanent impairments too.

**Aging.** 16px minimum base font size, with the ability to increase. High contrast mode available. Reduced motion option (respect prefers-reduced-motion). Generous touch targets. Avoid time pressure. Simplify navigation.

**Neurodivergence.** Reduce sensory overload: no autoplay, no animation that can't be paused, no flashing, no overwhelming color palettes. Support focus: minimize distractions, provide clear information hierarchy, allow customization of notification frequency. Provide structure: predictable layouts, clear labeling, consistent navigation. Avoid ambiguity: literal language, explicit instructions, unambiguous icons with labels.

### 7. Accessibility testing methodology

Automated tools catch approximately 30% of accessibility issues — mostly programmatic ones (missing alt text, insufficient color contrast, missing form labels). The other 70% — illogical reading order, confusing interaction patterns, missing context, poor focus management — require manual testing. Both are necessary. Neither is sufficient alone.

**Automated testing.** Tools: axe (browser extension and CI integration), Lighthouse (built into Chrome DevTools), WAVE (browser extension for visual overlay). Run automated scans on every page and state. Fix everything they flag. Passing automated tests does not mean the experience is accessible.

**Manual keyboard testing.** Tab through the entire flow from first element to last. Can you reach every interactive element? Can you activate every button and link? Can you navigate every dropdown and menu? Is focus order logical? Are focus indicators visible? Can you escape every modal and overlay? Can you complete the primary task without touching a mouse? Do this on every major flow, not just the homepage.

**Screen reader testing.** VoiceOver on Mac/iOS (built in — Cmd+F5 to toggle). NVDA on Windows (free download). TalkBack on Android (built in). Test with at least one screen reader on each target platform. Listen: does the reading order make sense? Are interactive elements announced with role and state? Do form fields have labels? Do live regions announce updates? Is there meaningful structure (headings, landmarks, lists)?

**Zoom testing.** Test at 200% and 400% browser zoom. Content should reflow to fit without horizontal scrolling. Text should remain readable. Interactive elements should remain usable. Nothing should overlap or be clipped.

**Color contrast testing.** Use a contrast checker. Check every text-background combination, every icon, every interactive element boundary. Check focus indicators against their background. Check in both light and dark modes. Check against actual backgrounds — text over images or gradients needs the worst-case contrast calculated.

**Reduced motion testing.** Enable "Reduce motion" in OS settings. Does the interface respect prefers-reduced-motion? Are essential animations replaced with non-motion alternatives? Do transitions still communicate state changes without relying on movement?

**The gap automated tools miss.** Is the reading order logical or just technically present? Does the heading structure reflect actual content hierarchy or just visual design? Do screen reader announcements actually help the user or just add noise? Is the keyboard interaction pattern intuitive or technically functional but confusing? Can a real user with a disability actually complete the primary task flow? These require human judgment, not automated rules.

## Output format

Adapt to scope. An accessibility spot-check needs different depth than a full WCAG audit.

```
## Accessibility Audit — Per WCAG Principle

### Perceivable
[Findings: contrast ratios, text alternatives, media accessibility,
color independence, reflow behavior]

### Operable
[Findings: keyboard accessibility, focus management, time limits,
touch targets, skip navigation]

### Understandable
[Findings: reading level, consistency, predictability, input assistance]

### Robust
[Findings: semantic HTML, ARIA usage, assistive tech compatibility]

## Screen Reader Flow Documentation
[Reading order for key pages/flows]
[Landmark structure]
[Heading hierarchy]
[Live region behavior]
[Form labeling audit]

## Keyboard Navigation Map
[Tab order for key flows]
[Focus management for modals, dropdowns, custom widgets]
[Keyboard shortcut inventory]
[Focus trap audit]

## Remediation Plan
### Critical (P0) — Blocks access for some users
[Issues that prevent task completion for assistive tech users]

### High (P1) — Significantly degrades the experience
[Issues that make the experience very difficult but not impossible]

### Medium (P2) — Below WCAG AA compliance
[Issues that fail specific WCAG criteria but don't block access]

### Low (P3) — Below best practices
[Issues that pass WCAG but fall short of inclusive design standards]
```

## Voice and approach

**Accessibility is a design quality, not a compliance burden.** Frame recommendations as making the experience better, not meeting a legal bar. Lead with the user benefit, not the success criterion number.

**But don't shy away from legal reality.** WCAG 2.1 AA conformance is legally required under the ADA (US), the European Accessibility Act (EU), Section 508 (US government), the Accessibility for Ontarians with Disabilities Act (Canada), and equivalent legislation in dozens of countries. Web accessibility lawsuits have increased every year for a decade. This is not theoretical risk.

**Be specific and actionable.** "Improve color contrast" is not a finding. "The body text (#767676) on white background fails WCAG AA at 4.48:1 — change to #595959 (7:1) or darker. Affects all body text across the application, approximately 80% of readable content." That's a finding with a fix.

**Teach the "why" behind the rule.** Don't just cite WCAG criteria — explain the human impact. "Add aria-label to this button" is a rule. "This icon button has no accessible name — a screen reader announces it as 'button' with no indication of what it does. A blind user encountering this in a toolbar of 8 icon buttons has no way to tell them apart. Add aria-label='Delete item' so the button is identifiable." That's understanding.

**Assume good intent.** Most accessibility failures are oversights, not decisions. Frame findings as opportunities to improve, not failures to punish.

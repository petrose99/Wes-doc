# articulate — autopilot digest of /home/ubuntu/Dev/Wes-doc/.claude/skills/articulate/SKILL.md. Full skill: read that path by range if a section you need is missing here.

## Core capabilities

### 1. Voice and tone framework creation

**Methodology:**
1. Identify 3-5 product/brand attributes that describe how the product should feel to use (not what it does).
2. Translate each attribute into a voice principle with a spectrum — not just "friendly" but "warm and direct, not casual or flippant." Each principle needs a clear boundary on both sides: what it is, and what it isn't.
3. Define the tone spectrum: voice stays constant, tone shifts by context. Map 4-6 key contexts and show how tone shifts across them.
4. Create a writing guidelines document with do/don't examples for each principle and context. Real examples from the product, not abstract rules.

**A voice framework is NOT:**
- A list of adjectives ("We're friendly, professional, innovative")
- A brand manifesto with no actionable guidelines
- A tone chart with no examples
- A document that only the original author can interpret

**A voice framework IS:**
- An actionable system where any writer can make consistent decisions
- Specific enough to resolve disagreements ("Is this too casual?" has a clear answer)
- Illustrated with real product copy, not marketing slogans
- Maintained and updated as the product evolves

### 2. Error message design

**Structure every error message with three components:**
1. **What happened** — Specific, not generic. "Your file couldn't upload because it's larger than 25 MB" not "Upload failed."
2. **Why it matters** — User impact, briefly. Skip this for trivial errors.
3. **What to do** — Actionable next step. If there's nothing the user can do, say so honestly: "We're working on it. Your data is safe."

**Tone scales with severity:**
- *Validation error* (wrong format, missing field) — Helpful, specific, inline. "Enter a valid email address" is fine. No drama.
- *Recoverable system error* (timeout, service unavailable) — Empathetic, honest. "We couldn't load your data. This usually resolves in a few minutes — try refreshing."
- *Destructive action warning* (delete account, remove data) — Clear and serious. Name exactly what will happen. "This will permanently delete your account and all your data. This can't be undone."
- *Data loss risk* — Direct and urgent without panic. "Your unsaved changes will be lost. Save before leaving?"

**Anti-patterns to eliminate:**
- "An error occurred" — meaningless; tells the user nothing
- Error codes without explanation — "Error 403" means nothing to most users
- Blame language — "You entered an invalid email" (blaming) vs. "That doesn't look like an email address" (helping)
- Missing recovery actions — describing the problem without a path forward
- Cascading errors — one failure triggering a screen full of red messages
- Jargon — "Request entity too large" belongs in logs, not in the UI

### 3. Empty state design

**Types of empty states, each with different needs:**

**First-use** — Onboarding moment. Explain the value of what they'll find here, guide them toward their first action, set expectations. Include: message explaining value, illustration or icon, primary action button, optional secondary action or learn-more link.

**No-results** — A search or filter returned nothing. Help the user adjust: suggest checking spelling, broadening filters, trying alternative terms. Show popular or recent items as a fallback. Never show a blank page with just "No results found."

**Cleared/completed** — Celebrate briefly, then suggest the next meaningful action. This state should feel good, not empty.

**Error-caused** — Explain what happened, when to try again, and what to do if it persists.

**For each empty state, specify:**
- Message (what happened and why, appropriate to the type)
- Illustration or icon direction (emotional tone, not specific artwork)
- Primary action (the one thing the user should do)
- Secondary action (alternative or escape route)

### 4. CTA and action language

**Hierarchy:**
- **Primary CTA** (one per screen): Use a specific verb that describes the user's action, not the system's. "Create project" not "Submit." "Send message" not "Process." "Start free trial" not "Continue." If users hesitate over it, the copy or the flow is wrong.
- **Secondary CTA**: Alternatives that don't compete with the primary action. "Save as draft," "Import from file," "Skip for now." Visible but visually subordinate.
- **Tertiary CTA**: Escape routes. "Cancel," "Go back," "Maybe later." Findable but not prominent. Don't hide them.

**Verb selection:** Use the action the user is taking, not the action the system is performing. "Send message" not "Submit form." "Delete account" not "Confirm." "Save changes" not "Update." For destructive actions, name the consequence explicitly: "Delete" is clearer than "Remove" which is clearer than "Confirm."

**Destructive actions need explicit consequences.** "Delete this project" is better than "Delete," but "Permanently delete this project and all its files" is best when the action is irreversible. Match the CTA gravity to the action gravity.

### 5. Microcopy patterns

**Tooltips** — Supplementary information, not required information. If users need the tooltip content to complete the task, it shouldn't be in a tooltip. Keep under 150 characters. Trigger on hover or focus, not just hover (accessibility). Don't repeat the label.

**Placeholders** — Show format or example, not the label. Date field labeled "Birthday" should have placeholder "MM/DD/YYYY," not "Enter your birthday." Never use placeholder text as the only label — it disappears when the user starts typing (memory burden + accessibility failure).

**Confirmation dialogs** — Restate what will happen in plain terms. Title names the action: "Delete this project?" Body states consequences: "This will permanently remove the project and all its files. Team members will lose access." Confirm button matches the action: "Delete project" not "OK" or "Confirm." Cancel button is a clear exit: "Keep project" is better than "Cancel."

**Success messages** — Confirm what specifically happened, not just that something happened. "Your profile photo has been updated" beats "Success!" Suggest next step when relevant. Keep brief.

**Loading messages** — Set expectations with specificity. "Uploading your file (2 of 5)..." beats "Loading..." For long waits, reassure: "This usually takes about 30 seconds."

**Progress copy** — Tell users what's happening at each step, what's next, what they've completed. "Step 2 of 4: Choose your plan" gives location, total effort, current task. Avoid purely numerical progress ("47% complete") without context.

### 6. Content modeling

**Structured content types** — Define components of each content type, e.g. "product listing" has: title (max 60 chars), description (max 200 chars), price, image, category, availability status. "Notification" has: headline, body, action URL, timestamp, severity level.

**Reuse patterns** — Write content once, display in multiple contexts (product card truncated, detail page full, search result headline+first line, notification, email). Design content model so a single piece of content has truncation rules, context-specific variants, fallback behavior.

**Localization-readiness** — Build translation-friendly content from the start:
- Avoid concatenated strings ("You have " + count + " items") — word order varies by language
- Avoid date-relative language ("yesterday," "last week") — build from timestamps at render time
- Avoid idioms and culturally specific humor — "piece of cake" doesn't translate
- Allow for text expansion — German and Finnish run 20-35% longer than English; layouts must accommodate this
- Avoid embedding text in images — images can't be translated easily

**Content lifecycle** — Who creates, reviews, publishes, archives/deletes each content type? Define ownership, review cadence, retirement criteria.

### 7. Inclusive language

**Language to avoid:**
- *Ableist language*: "blind spot" (say "gap"), "lame" (say "inadequate"), "crazy" (say "unexpected" or "wild"), "sanity check" (say "confidence check"), "crippling" (say "severe")
- *Gendered defaults*: "he/she" constructions (use "they"), "mankind" (use "people" or "humanity"), "manpower" (use "workforce" or "effort")
- *Culturally specific idioms*: "knock it out of the park," "back to square one," "low-hanging fruit" — don't translate, exclude non-native speakers
- *Unnecessarily complex vocabulary*: "utilize" (say "use"), "facilitate" (say "help"), "leverage" (say "use" or "build on"), "aforementioned" (say "this" or name it)

**Readability:**
- Aim for 8th grade reading level (Flesch-Kincaid) for consumer products.
- Short sentences (under 25 words). One idea per sentence.
- Active voice by default ("We sent your receipt" not "Your receipt has been sent")
- Concrete language over abstract ("Your file is 3 MB too large" not "The upload exceeds the maximum allowable size")

**Write for people who are:**
- Stressed (error states, payment flows, health information)
- Distracted (mobile, notifications, interruptions)
- Not fluent in the product's language (international users, technical novices)
- Using assistive technology (screen readers linearize content; copy must make sense read aloud in sequence)
- Reading on a small screen (every word competes for space)

## Output format

Structure your content deliverable as needed for the problem at hand. Not every format applies to every project — use what serves the problem:

1. **Voice and Tone Framework** — Product attributes, voice principles with boundaries, tone spectrum across contexts, do/don't examples for each principle. Real product copy examples, not abstract rules.

2. **Copy Deck** — Screen-by-screen copy with variants. For each screen: primary message, instructional copy, CTA text, microcopy, error messages, empty states. Flag localization concerns. Note where copy depends on system state or user data.

3. **Microcopy Pattern Library** — Reusable patterns for common components: tooltips, placeholders, confirmation dialogs, success messages, loading states, progress indicators. Each pattern with usage guidelines, character limits, and examples.

4. **Content Model** — Structured definitions for each content type: components, character limits, truncation rules, display contexts, localization notes, lifecycle ownership.

5. **Error Message Inventory** — Catalog of all error states with: trigger condition, message copy (what happened + why it matters + what to do), severity level, tone guidance.

6. **Pending Questions** — What needs user research, stakeholder input, or technical clarification before the copy can be finalized. What assumptions are baked into the current copy.

## Voice & approach

- **Clear over clever.** A pun that makes one person smile and confuses ten others is a bad trade.
- **Specific over vague.** "Your photo has been updated" beats "Changes saved." "Try a file under 25 MB" beats "File too large."
- **Human over corporate.** "We couldn't find that page" beats "404: The requested resource could not be located."
- **Show the user you respect their time and intelligence.** Don't over-explain what's obvious. Don't under-explain what's confusing.
- **Every word should earn its space on screen.** If a word doesn't help the user understand, decide, or act, remove it.

## Always ask

- What does the user need to know right now? (Not everything — just right now.)
- What action should they take, and does the copy make that obvious?
- What could go wrong, and do our error messages actually help?
- Would this make sense read aloud by a screen reader?
- Would this make sense to someone reading it on a phone while walking?
- Will this translate? (If not, rewrite it so it will.)
- Are we using the user's language, or ours?

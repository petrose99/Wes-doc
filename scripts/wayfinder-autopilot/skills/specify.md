# specify — autopilot digest of /home/ubuntu/Dev/Wes-doc/.claude/skills/specify/SKILL.md. Full skill: read that path by range if a section you need is missing here.

## Core capabilities

### 1. Detailed design specifications

Write comprehensive, screen-by-screen (or state-by-state) specifications that document:
- Visual design with specific measurements, colors, typography, spacing
- Interaction logic: what triggers what, in what order, with what conditions
- Copy: exact text, variants for different contexts/markets/edge cases
- States: default, hover, active, error, loading, empty, success — all documented visually and logically
- Constraints: device sizes, performance requirements, accessibility needs

Output should be a living spec document (HTML or markdown) that engineers can reference during implementation without guessing.

### 2. Organized engineering handoff packages

Structure deliverables so engineering knows exactly what to build and why:
- Clear ownership: who decided what and when
- Problem context: what user need or business problem does this solve
- Design approach: constraints considered, alternatives rejected and why
- Use cases: specific, not generic — real user scenarios that expose edge cases
- Assets: all files organized, named, versioned, with usage notes
- Test criteria: success metrics and audience-specific test plans

### 3. Copy and variant matrices

Document all copy variations in one place:
- Primary copy vs. secondary copy vs. microcopy (labels, hints, errors, empty states)
- Market variants: tone shifts, cultural considerations, regulatory language
- Edge cases: character limits, long strings, very short strings, numeric edge cases
- A/B test variations: explicit copy changes being tested, with success criteria

### 4. Interactive HTML specification documentation

When appropriate, produce interactive HTML specs that:
- Show designs inline with explanatory text
- Link related screens and decisions
- Include collapsible reference sections (component specs, copy matrices, test plans)
- Are self-contained and viewable in any browser without external dependencies

### 5. Use case and edge case documentation

Write out specific, not generic use cases:
- "First-time user creating an account" vs. "User logs in"
- "Network timeout during payment" vs. "Error state"
- "User has 200+ items in cart" vs. "User has items in cart"
- Document how the design behaves in each case, what copy appears, what happens next

### 6. Stakeholder presentations

Structure presentations that align cross-functional teams:
- Problem statement (from `/strategize`)
- Design approach and constraints considered
- Key decisions and what was intentionally NOT done
- Test plan: what we're measuring and why (from `/measure`)
- Open questions: what we still need to resolve
- Timeline and dependencies

### 7. Test plans with success criteria

Write test plans that pair observations with decision-makers:
- Who needs to see this work (PM, engineering lead, CEO?)
- What success looks like: specific, measurable outcomes (connected to `/measure` GSM chains)
- What we're learning and why we're learning it
- How results feed back into design iteration

---

## Output format template

Follow this structure for comprehensive handoffs:

```
## Ownership & Context
- Owner: [Name, role]
- Created: [Date]
- Status: [Draft/Ready for Engineering/In Implementation]
- Design document version: [v0.1, etc.]

## Problem & User Need
[1-2 paragraphs: what problem does this solve, for whom, why now]

## Design Approach
- Constraints considered: [device, performance, accessibility, brand, etc.]
- Design strategy: [how we approached the problem]
- What we did NOT do (and why): [alternatives considered and rejected]

## UX Questions Answered
[List specific design questions this spec resolves, e.g.:
- How does the user know this action succeeded?
- What happens if the API returns no results?
- How do we handle very long titles?]

## Ethical Review
[Before handoff, check the design against Intent's anti-pattern catalog:]
- Patterns reviewed: [list specific interaction patterns checked]
- Potential concerns: [any patterns that could be perceived as manipulative]
- Design intent documentation: [for each concern, document the intent behind the decision and why it serves user interest]
- Dark pattern clearance: [explicit statement that the design was reviewed and does not employ deceptive, coercive, or manipulative patterns]

## Measurement
[Connected to /measure's success criteria:]
- Primary success metric: [from GSM mapping]
- Counter-metrics: [what must NOT get worse]
- Instrumentation needs: [what events/data engineering needs to capture]
- Learning plan: [when to check metrics post-launch — day 1, week 1, month 1]

## Design Specification

### Screen [Name/ID]
**Intent:** [Why does this screen exist? What user need does it serve? What happens if we remove it?]

**Behavior:** [What does the user see and what can they do?]

**Layout & Styling:**
- [Specific measurements, spacing, colors, fonts]
- [Visual hierarchy and grid placement]

**Copy:**
- Headline: "[Exact copy]"
- Description: "[Exact copy]"
- Button label: "[Exact copy]"
- Error state: "[Exact copy]"
- Empty state: "[Exact copy]"

**Interaction Logic:**
- On load: [what happens]
- On user action [X]: [expected outcome]
- On error [Y]: [fallback behavior and messaging]

**Accessibility:**
- ARIA labels: [if needed]
- Keyboard navigation: [if needed]
- Color contrast: [ratios if non-standard]

**States:** [Visual and copy documentation for default, hover, active, error, loading, empty states]

[Repeat for each screen/state]

## Use Cases & Variants

### Use Case 1: [Specific scenario]
[Describe the user journey, what they see at each step, what copy appears, what happens on success/failure]

### Use Case 2: [Specific scenario]
[Repeat as needed; be specific, not generic]

## Copy Matrix

| Element | Primary | Edge Case 1 | Edge Case 2 | Market Variant (DE) | A/B Test Variant |
|---------|---------|-------------|-------------|-------------------|-----------------|
| Headline | "[Copy]" | "[Copy]" | ... | ... | ... |
| [Repeat for each copy element] |

## Test Plan

### Audience 1: [PM / Engineering / End User]
**What we're testing:** [Specific behavior]
**Success looks like:** [Measurable outcome, connected to Measurement section]
**How we measure it:** [method/tool]

### Audience 2: [Different audience]
[Repeat as needed]

## Pending Questions

### Design Questions
- [Question 1: impacts design decision]
- [Question 2: impacts design decision]

### Engineering Questions
- [Question 1: impacts implementation approach]
- [Question 2: impacts implementation approach]

## Assets & Deliverables

**Design files:**
- [Figma file name and link]
- [Specific artboards/pages to reference]

**Handoff package contents:**
- Design spec (this document)
- Design files (Figma link)
- Copy matrix (separate or embedded)
- Test plan (separate or embedded)
- [Any other assets]

**File naming & organization:**
- [How files are named and organized in assets/]
- [Version control approach if applicable]

## Appendix

[Reference material: component specs referenced, design system tokens, brand guidelines excerpts, accessibility standards applied, etc.]
```

---

## Quality checklist

Before marking a handoff as complete, verify:

- [ ] Every screen has a documented intent — why it exists and what user need it serves (no real estate tours)
- [ ] All screens and states are visually documented
- [ ] All copy is written out (no placeholders like "TBD")
- [ ] All variants (markets, edge cases, A/B tests) are documented
- [ ] Edge cases are addressed (empty states, errors, long content, network delays)
- [ ] Pending questions are explicitly flagged (design + engineering)
- [ ] Ownership is stated (who, when, status)
- [ ] Test plan is included with specific success criteria
- [ ] Assets are organized and named; their locations are documented
- [ ] Open questions don't block engineering; they're flagged for parallel resolution
- [ ] Copy matrix includes all variations needed for implementation
- [ ] Interaction timing is specified where relevant (e.g., toast duration, animation speed, debounce intervals)
- [ ] For A/B tests: both variants are documented side-by-side with explicit differences called out
- [ ] Ethical review completed: design checked against anti-pattern catalog
- [ ] Measurement section completed: success metrics, counter-metrics, and instrumentation needs documented

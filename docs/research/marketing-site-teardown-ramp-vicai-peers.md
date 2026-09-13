# Marketing site teardown — Ramp, Vic.ai, Mercury, Brex

Ticket: [#127 — Multi-page marketing site redesign + SEO research](https://github.com/petrose99/docubite/issues/127) (Map #126)

Feeds two downstream decisions:
- **#131** (information architecture) — read the "For IA decision" sections.
- **#132** (visual direction) — read the "For visual-direction decision" sections.

Do not use this file to modify #127; it is research input only.

## Method and limitations

Pages were fetched live via WebFetch (HTML → markdown, summarized by a fast model) on 2026-09-13, supplemented with WebSearch where a page 404'd or a summary was thin. WebFetch summarizes rather than returning raw HTML, so exact pixel values (hex colors, px spacing) are **not** independently verifiable this way — visual claims below are the fetch tool's qualitative read of the rendered page, not a computed style audit. Treat color/spacing claims as directional, not literal design tokens. Nav item lists, headline copy, stat callouts, and page structure/order are higher-confidence since they reflect actual page content.

Pages fetched:
- ramp.com (homepage), ramp.com/pricing, ramp.com/security, ramp.com/customers — all loaded successfully.
- vic.ai (homepage) — loaded. vic.ai/security 404'd; found the real page at **vic.ai/trust-and-security** via WebSearch and fetched it directly.
- mercury.com (homepage) — loaded successfully.
- brex.com (homepage) — loaded, but nav items weren't clearly itemized by the fetch (see gap below).
- navbar.gallery/navbar/ramp — attempted for a structured nav breakdown; returned only a generic description ("Ramp uses a mega menu"), not the actual column contents, so not usable as a source beyond confirming Ramp uses mega-menu-style nav.

Gaps: exact mega-menu column contents for Ramp's "Products," "Partners," and "Solutions" dropdowns were not retrievable in detail (the fetch tool saw the dropdown existed but not its full contents). Brex's nav item labels weren't itemized by the fetch. Rippling was not fetched (time/tool budget went to getting Ramp + Vic.ai + two peers solidly instead of a third peer thinly).

---

## For IA decision (#131)

### 1. Every site examined is multi-page with a small, consistent top-level set — none is a single long-scroll homepage

DocuBite's current site is one page (`app/(marketing)/page.tsx`). Every comparable fetched here uses a conventional multi-page structure:

**Ramp** — top nav, in order: **Products** (dropdown), **Partners** (dropdown), **Solutions** (dropdown), **Resources** (dropdown), **Customers** (direct link), **Pricing** (direct link), plus top-right actions Sign in / See a demo / Get started. Footer additionally surfaces: Docs, Help Center, Integrations, Trust Center, and individual product pages (Cards, Expense Management, AP, Travel, Procurement, Intelligence, Accounting, Banking), plus About and Customers.
Source: https://ramp.com , https://ramp.com/pricing

**Vic.ai** — top nav: **Why Vic.ai?**, **Products**, **Solutions**, **Resources**, **Company**. Products dropdown contains Accounts Payable (with sub-items Invoice Processing, PO Matching, Approvals), AP Inbox, Bill Pay and Vendor Portal, Expense Management, Analytics and Insights, Autonomous Finance Platform, VicAgents. Solutions dropdown is organized three ways at once: **by use case** (Centralize AP Operations, Faster Monthly Close, Fraud Prevention, Vendor Management, Scale For Growth), **by role** (CFO, Controller, Accounts Payable), **by industry** (Freight and Logistics, Construction, Manufacturing, Retail). Resources dropdown: Case Studies, Datasheets, Guides, Videos, Podcasts, Webinars, Events, Glossary, Blog, Product Tour. Company dropdown: About, Careers, Newsroom, Contact, Partners, Become a Partner.
Source: https://vic.ai

**Mercury** — top nav: **Products** (Business Banking, Cards & Spend Management, Payments & Invoicing, Intelligence, Personal Banking), **Solutions** (Tech, Ecommerce, Agencies/Consultants, VC Funds, Crypto, Accounting Firms, and more), **Resources** (Blog, Perks, Tools, Product Releases), **About** (Our Story, Events, Partnerships, Careers, Help Center, FAQs), **Pricing** — plus Dashboard / Log In / Open Account.
Source: https://mercury.com

**Brex** — hero-level content organizes around product categories (cards, expense management, travel, bill pay, banking); exact top nav labels weren't cleanly captured by the fetch (gap noted above), but the page structure still separates product, use-case, and resource content into distinct sections/pages rather than one scroll.
Source: https://www.brex.com

**Takeaway for #131**: the pattern across all three fully-captured sites (Ramp, Vic.ai, Mercury) is the same five-to-six-bucket top-level IA: **Product(s)** (often split into sub-products), **Solutions** (segmented by use case / role / industry — Vic.ai does all three at once), **Resources** (content library: guides, case studies, blog, webinars), **Customers/Case studies** (sometimes folded into Resources, sometimes its own top-level item — Ramp gives it a standalone nav item), **Pricing** (standalone, always present, always reachable from top nav), and **Company/About** (careers, contact, press). Security/Trust is usually its own page but not always in the primary nav — Ramp puts "Trust Center" in the footer/secondary row, not the main nav; Vic.ai's trust page (vic.ai/trust-and-security) also isn't in the primary top-level nav shown on the homepage — it's reached from footer or a demo-gated content flow. This suggests DocuBite's IA should have a dedicated Security/Trust page but it does not need to fight for primary-nav real estate; Pricing, Product, and Solutions/Customers do.

### 2. Nav depth is mega-menu, not flat, once a company has more than ~3 product lines

Ramp (Cards, Expense Mgmt, AP, Travel, Procurement, Intelligence, Accounting, Banking) and Vic.ai (AP, AP Inbox, Bill Pay/Vendor Portal, Expense Mgmt, Analytics, Autonomous Finance Platform, VicAgents) both use mega-menus because they have 6+ product surfaces to expose. Mercury's Products dropdown is shorter (5 items) but still a dropdown, not flat links. **Implication for #131**: DocuBite's actual product surface (AP automation / document-to-ledger, likely fewer discrete "products" than Ramp) may not need a full mega-menu — a flat top-level nav (Product, Solutions, Pricing, Security, Customers, Company/Resources) is closer to Mercury's shallower version than Ramp's dense one. Match nav complexity to actual product-line count rather than copying Ramp's mega-menu for its own sake.

### 3. Customer/case-study pages are structured, filterable content, not just testimonial quotes

Ramp's customers page (ramp.com/customers) opens with an aggregate headline ("70,000+ companies spend less, close faster, and finance smarter on Ramp"), then a logo carousel, then 4-5 full-width **featured** case studies (logo/hero image + named executive quote + "Customer story" link), then a **compact stats grid** ("Healthier businesses run on Ramp" — one company + one hard metric per card, e.g. Barry's "400 hours back monthly," Glossier "90% of transactions automatically coded"), then an **all-stories archive** filterable by company size, industry, and product category.
Source: https://ramp.com/customers

**Implication for #131**: a customer-stories page is not one template but three nested densities — hero-featured (few, deep), compact-grid (many, one stat each), and filterable-archive (all, browsable). If DocuBite builds a customer page, this three-tier structure is a proven pattern to reuse rather than inventing a new one, and it argues for a dedicated page/route (not a homepage section) once there are more than 3-4 case studies to show.

### 4. Pricing pages combine self-serve tiers with a sales-gated enterprise tier, and lean on a full feature-comparison table

Ramp's pricing page: three tiers (Free — $0/mo/user; Plus — $15/mo/user + platform fee; Enterprise — custom quote/contact sales), each a vertical card, with a full side-by-side comparison table underneath organized by feature category (Corporate Card, Travel, Expense Management, etc.), tier-specific "+" feature callouts, and customer logos for trust. CTA copy differs by tier: "Get started for free" vs. "Contact sales."
Source: https://ramp.com/pricing

**Implication for #131**: pricing is a real standalone page with a comparison table, not just a CTA — worth scoping if DocuBite's own pricing is public/self-serve enough to support one.

---

## For visual-direction decision (#132)

### 1. Security/trust pages use restraint and reassurance-plus-specifics, not fear or jargon-dumps

Ramp's security page (ramp.com/security) leads with the headline **"Peace of mind at every step"** and structures as: (1) four feature callouts (SSO logins, fraud controls, 24/7 monitoring, data encryption), (2) a compliance section naming SOC 2 Type II and PCI compliance specifically, (3) a closing CTA. Tone mixes emotional reassurance ("Never worry," "Rest easy") with concrete technical anchors (named protocols, named certifications) — reassurance is earned by specificity, not adjectives alone. Visually: large abstract product imagery (not photography of servers/locks), clean section breaks, minimal text density per section.
Source: https://ramp.com/security

Vic.ai's equivalent (vic.ai/trust-and-security, note: NOT at the vic.ai/security URL — it 404s there) leads with **"How Vic.ai protects your data, your processes, and your organization"** and "secure, compliant, and enterprise-ready," structured as: value-prop opener → certification/infrastructure summary → a 12+ item **FAQ section** (unlike Ramp, which uses feature callouts, not FAQ) → CTA → a downloadable "CFO security guide" as a gated content offer. Certifications named explicitly: SOC 1 Type II, SOC 2 Type II (renewed annually, third-party audited), ISO 27001, independent annual pen testing, AES-256 at rest / TLS in transit, named AWS infrastructure. Visual description: clean, minimal, monochromatic iconography, ample whitespace, subtle accent colors.
Source: https://www.vic.ai/trust-and-security ; certification detail cross-checked via WebSearch (PR Newswire SOC 2 Type II announcement, trycomp.ai SOC2-for-AI overview).

**Implication for #132**: the visual formula for a trust page in this category is: abstract/product imagery over literal padlock-and-shield iconography, named specific certifications (not "bank-level security" vagueness), short scannable sections over dense paragraphs, and a monochrome-plus-one-accent palette rather than a colorful one. This is a good direct reference for whatever DocuBite's security page becomes.

### 2. Homepage heroes are short claim + one-line proof + single primary CTA, then immediate logo-based social proof

- Ramp: promotional banner ("$3,100 signup bonus...") ahead of hero; deeper down: "Trusted by 70,000+ businesses including Notion, Shopify, Webflow, Eventbrite, Poshmark, Quora," backed by hard numbers ("27M+ hours collectively saved," "close books 75% faster," "run intake-to-pay 3x more efficiently") and named-executive testimonials (Notion's CAO and CFO by name and title).
- Vic.ai: headline **"AP automation, reimagined"**, subhead **"Cut costs, improve accuracy, and scale smarter with AI-first accounting,"** two CTAs ("Request demo," "Our platform"), hero video plus a wall of specific stats (5X faster invoice processing, 85% no-touch rate by month 6, 99% invoice accuracy, "1st autonomous platform for accounting," 7-month payback), named customer logos and named-executive quotes (e.g., Paul Dachsteiner, VP of IT/IS, Stonewall Kitchen).
- Mercury: headline **"Radically different banking,"** subhead **"Apply online in 10 minutes to experience banking unlike anything that's come before,"** primary CTA "Open account," secondary "Launch demo," founder-portrait testimonials (Linear, Gainful, Ways & Means, each named), press logos (CNBC, Fortune, WSJ), and headline stats ("1 in 3 startups choose Mercury," "$20B+ monthly transaction volume," "4.9 Apple App Store rating").
- Brex: hero copy "Simplify expense management with Brex's finance platform," CTA "Get started," stats "Trusted by 35,000+ top companies," "756 hours average time saved per year," "71% of all expenses... handled entirely by automations," treasury yield claim "up to 4.36%."

**Implication for #132**: the consistent pattern across all four is **named, specific, numeric proof** (not "trusted by industry leaders" — always a number, often with a named company and named person attached) placed immediately below or beside the hero, not buried. If DocuBite's current single-scroll homepage has vague social proof, this is the sharpest, most portable visual/content pattern: real named logos + a hard stat + named executive quotes with title, close to the fold.

### 3. Imagery leans abstract/product-screenshot over stock photography; illustration is used for feature categories, not decoration

- Ramp security page: "large, abstract product photography," not literal security iconography.
- Vic.ai homepage: "mix of product screenshots (invoice processing interfaces, analytics dashboards), customer logos, and professional photography of finance scenarios," dark background with blue accent CTAs, "subtle gradient backgrounds, icon illustrations for feature categories, video backgrounds for hero."
- Mercury: "mix of product screenshots, abstract illustrations (circles, graphs, payment flows), and lifestyle photography of founders," Mercury-blue-led palette, uppercase sans-serif section headers, card-based modular layout.
- Brex: "modular tile layouts with branded imagery," images showing product interfaces across company stages/use cases.

**Implication for #132**: the category convention is product screenshots doing the heavy lifting (proving the tool is real and works), abstract graphic elements (gradients, line/circle illustration) used sparingly for section dividers or feature icons, and photography reserved specifically for **people** (founders, executives) attached to testimonials — not generic office/handshake stock photography. Vic.ai's use of a darker theme with a blue accent stands out against Ramp/Mercury's lighter, more neutral palettes — worth deciding deliberately whether DocuBite wants the "dark, AI-forward" register (Vic.ai) or the "light, clean fintech" register (Ramp/Mercury/Brex), since both read as "professional" but signal differently (Vic.ai reads more overtly "AI product," the lighter sites read more "financial infrastructure").

### 4. Motion is restrained and functional, not decorative flourish

None of the fetches surfaced heavy scroll-triggered animation or parallax as a defining feature; motion mentions were limited to a hero video (Vic.ai) and standard carousel rotation for logos (Ramp, Vic.ai). This is consistent with "clean/professional" reading as **low animation density** — motion used for one hero element or a logo marquee, not throughout the page.

---

## Sources

- https://ramp.com (homepage)
- https://ramp.com/pricing
- https://ramp.com/security
- https://ramp.com/customers
- https://vic.ai (homepage)
- https://www.vic.ai/trust-and-security
- https://mercury.com (homepage)
- https://www.brex.com (homepage)
- https://www.navbar.gallery/navbar/ramp (thin result, confirms mega-menu use only)
- WebSearch: "vic.ai trust security compliance SOC 2" (used to locate the correct trust-page URL and cross-check certification claims via PR Newswire / trycomp.ai)

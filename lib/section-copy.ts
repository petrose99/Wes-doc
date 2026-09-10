export type SectionKey = "extraction" | "library" | "sheets" | "dashboard"

export interface SectionCopy {
  banner: string
  howItWorks: string[]
}

export const SECTION_COPY: Record<SectionKey, SectionCopy> = {
  extraction: {
    // "extraction" as the key stays for API stability; the copy talks about Documents (the rail
    // label the merge introduced) and the five-stage lifecycle (Inbox → Review → Approved → Synced
    // → Paid) rather than the pre-merge "drop, review, move to Library" flow.
    banner:
      "Documents is your inbox: drop files, we OCR, split and extract, you review, approve, sync, and mark paid.",
    howItWorks: [
      "Add PDFs or drag a folder — we run OCR automatically. New arrivals land on Inbox.",
      "Multi-page files are split into individual documents; extracted rows move to Review.",
      "Approve confirms the extraction; Synced pushes to accounting; Paid records the payment.",
    ],
  },
  library: {
    banner:
      "Browse, filter, and search across every reviewed document.",
    howItWorks: [
      "Reviewed documents land here automatically — browse, filter, and search across everything.",
      "Pull documents into Sheets whenever you need to compute or analyse.",
    ],
  },
  sheets: {
    banner:
      "Sheets are spreadsheets you compute in; bring in your financial statements, invoices, or any spreadsheet — or pull documents already in your Docu Library. Use built-in formulas, the =AI() function, or ask the AI assistant to do the work.",
    howItWorks: [
      "Import your own xlsx/csv files (financial statements, reports, etc.) or pull documents from Docu Library.",
      "Use formulas, the =AI() function, and the AI assistant to analyse and compute.",
      "Every cell from an extraction keeps provenance — right-click to jump back to the source document.",
    ],
  },
  dashboard: {
    banner:
      "Your workspace at a glance: see what needs attention and pick up where you left off.",
    howItWorks: [
      "Stat cards show documents this month, waiting for review, and approved.",
      "The review queue surfaces documents that need your input.",
      "Recent files let you jump straight back into a sheet.",
    ],
  },
}

export const ONBOARDING_STEPS = [
  { key: "upload", label: "Add your first document", section: "extraction" as SectionKey },
  { key: "review", label: "Review a document", section: "extraction" as SectionKey },
  { key: "find_library", label: "Find it in Docu Library", section: "library" as SectionKey },
  { key: "pull_sheet", label: "Pull it into a Sheet", section: "sheets" as SectionKey },
  { key: "ask_question", label: "Ask a question", section: "sheets" as SectionKey },
] as const

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"]

/** Every target here must match a live `data-tour-target` in the rendered shell (see sidebar.tsx).
 * A step pointing at something that never renders leaves the tour with nothing to spotlight — it
 * still works, since welcome-tour.tsx falls back to a centred card, but it describes UI the visitor
 * cannot see. A "search" step lived here for exactly that reason: components/shell/global-search.tsx
 * is written but never imported anywhere, so the launcher it describes is not in the app. */
export const TOUR_STEPS = [
  { target: "extraction", title: "Documents", description: "Add and review documents here — through Inbox, Review, Approved, Synced, and Paid." },
  { target: "library", title: "Docu Library", description: "Your permanent, searchable document library." },
  { target: "sheets", title: "Sheets", description: "Spreadsheets with AI — pull documents in and compute." },
] as const

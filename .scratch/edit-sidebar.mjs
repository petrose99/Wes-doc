import { readFileSync, writeFileSync } from 'node:fs'
const p = '/home/ubuntu/Dev/Wes-doc/components/shell/sidebar.tsx'
let s = readFileSync(p, 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b) }

rep(`import { AlertTriangle, Banknote, CheckCircle2, ClipboardCheck, Files, HeartPulse, History, Landmark, Library, PanelLeftClose, PanelLeftOpen, Percent, Receipt, Settings, Wallet, Workflow, Zap } from "lucide-react"`,
    `import { AlertTriangle, Banknote, CheckCircle2, ClipboardCheck, Files, HeartPulse, History, Landmark, Library, PanelLeftClose, PanelLeftOpen, Percent, Receipt, Settings, Wallet, Workflow, Zap } from "lucide-react"
import { adminPaths } from "@/lib/admin/paths"`)
rep(`const QUEUE_SEGMENTS = ["invoices", "purchase-orders", "receipts", "bank-statements", "exceptions", "payments"]`,
    `// #231 Q20 (#252): Admin collapses the rail exactly as a queue does — its own left nav needs the width.
const QUEUE_SEGMENTS = ["invoices", "purchase-orders", "receipts", "bank-statements", "exceptions", "payments", "admin"]`)
rep(` * Settings-tagged module items (Rules, Tax, Approvals) don't render here at all — they show up in
 * components/shell/settings-nav.tsx instead, and unplugged surfaces (lib/unplugged) never render. */`,
    ` * Settings-tagged module items (Rules, Tax) don't render here at all — they live inside Admin
 * (#252) — and unplugged surfaces (lib/unplugged) never render. */`)
rep(` * Four typed intake destinations sit in two peer pairs, followed by Exceptions, Controls, Finance
 * and Archive.`, ` * Four typed intake destinations sit in two peer pairs, followed by Exceptions, Payments, Finance
 * and Archive. Controls left the spine on #231 (#252): its pages are Admin's now.`)
rep(`  // Controls (the touchless-automation module's nav item) is hoisted out of the module bucket
  // into the primary spine, directly under the typed intake group: it is the levers that govern the document
  // pipeline, so adjacency to the pipeline it controls is the information architecture.
  const controlsItem = moduleWorkItems.find((item) => item.href === \`\${base}/automation\`)
  // The review-queue module's "Review" item is dropped (#238): since #225 every queue is the
  // review surface, so a second entry for the same job was a second grammar.
  const otherModuleItems = moduleWorkItems.filter((item) => item.href !== \`\${base}/review\` && item.href !== \`\${base}/automation\`)`,
    `  // The review-queue module's "Review" item is dropped (#238): since #225 every queue is the
  // review surface, so a second entry for the same job was a second grammar. Controls
  // (\`/automation\`) is dropped too (#231 Q9, #252): its pages moved into Admin.
  const otherModuleItems = moduleWorkItems.filter((item) => item.href !== \`\${base}/review\` && item.href !== \`\${base}/automation\`)`)
rep(`    ...(controlsItem ? [controlsItem] : []),
`, ``)
rep(`  const bottomItems = [
    { href: \`\${base}/settings/workspace\`, label: "Settings", icon: Settings, exact: false },
    { href: \`\${base}/activity\`, label: "Activity", icon: History, exact: false },
    { href: \`\${base}/health\`, label: "Health Checks", icon: HeartPulse, exact: false },
  ]`, `  // #231 Q9 (#252): one rail item, Admin, last — Settings and Controls fold into it.
  const bottomItems = [
    { href: \`\${base}/activity\`, label: "Activity", icon: History, exact: false },
    { href: \`\${base}/health\`, label: "Health Checks", icon: HeartPulse, exact: false },
    { href: adminPaths(workspaceId).configuration, label: "Admin", icon: Settings, exact: false },
  ]`)
rep(`      || (item.label === "Settings" && pathname.startsWith(\`\${base}/settings\`))`,
    `      || (item.label === "Admin" && (pathname.startsWith(\`\${base}/admin\`) || pathname.startsWith(\`\${base}/settings\`) || pathname.startsWith(\`\${base}/automation\`)))`)
rep(`      <AccountMenu name={user.name} email={user.email} collapsed={compact} />`, `      <AccountMenu name={user.name} email={user.email} collapsed={compact} workspaceId={workspaceId} />`)
writeFileSync(p, s)
console.log('ok')

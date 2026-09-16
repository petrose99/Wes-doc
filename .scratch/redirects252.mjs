// #252: leave a 308 redirect stub at every old Settings / Controls address, plus the Admin index.
import { writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs'
const ws = '/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]'

const stub = (segment) => `import { permanentRedirect } from "next/navigation"
import { legacyAdminTarget } from "@/lib/admin/paths"

/** #252: this address moved into Admin. A 308 so bookmarks and old links keep landing. */
export default async function LegacyRedirect({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  permanentRedirect(legacyAdminTarget(workspaceId, "${segment}")!)
}
`

const settings = ['workspace', 'modules', 'rules', 'tax', 'categories', 'email', 'payments', 'templates', 'reports', 'integrations', 'accounting-mapping', 'security']
for (const s of settings) {
  const dir = `${ws}/(chrome)/settings/${s}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/page.tsx`, stub(`settings/${s}`))
}
writeFileSync(`${ws}/(chrome)/settings/page.tsx`, stub('settings'))

const automation = ['settings', 'warn-checks', 'vendors', 'approvals', 'matches']
for (const a of automation) {
  const dir = `${ws}/automation/${a}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/page.tsx`, stub(`automation/${a}`))
}
writeFileSync(`${ws}/automation/page.tsx`, stub('automation'))

writeFileSync(`${ws}/admin/page.tsx`, `import { permanentRedirect } from "next/navigation"
import { adminPaths } from "@/lib/admin/paths"

/** The Admin rail item lands on Configuration — the section an owner opens most. */
export default async function AdminIndex({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  permanentRedirect(adminPaths(workspaceId).configuration)
}
`)
console.log('stubs written')

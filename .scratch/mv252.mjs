// #252 helper: git mv the two Controls pages under Admin and create the Admin route folders.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
const ws = `${root}/app/(app)/workspaces/[workspaceId]`
for (const d of ['po-mismatch-flows', 'approval-flows', 'suppliers', 'integrations', 'users', 'companies']) mkdirSync(`${ws}/admin/${d}`, { recursive: true })
mkdirSync(`${ws}/account/security`, { recursive: true })
const mv = (a, b) => execFileSync('git', ['mv', a, b], { cwd: root })
mv(`${ws}/automation/matches/page.tsx`, `${ws}/admin/po-mismatch-flows/page.tsx`)
mv(`${ws}/automation/approvals/page.tsx`, `${ws}/admin/approval-flows/page.tsx`)
mv(`${ws}/automation/vendors/page.tsx`, `${ws}/admin/suppliers/page.tsx`)
mv(`${ws}/(chrome)/settings/integrations/page.tsx`, `${ws}/admin/integrations/page.tsx`)
mv(`${ws}/(chrome)/settings/workspace/page.tsx`, `${ws}/admin/users/page.tsx`)
mv(`${ws}/(chrome)/settings/security/page.tsx`, `${ws}/account/security/page.tsx`)
console.log('moved')

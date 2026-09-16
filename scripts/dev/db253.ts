// #253 helper: inspect the devdb columns/constraints for the migration, resolve the failed record,
// and seed flows for the dev workspace. node .impeccable/live/db253.mjs inspect|resolve|seed
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { prisma } from '@/lib/db'

const root = '/home/ubuntu/Dev/Wes-doc'
for (const line of readFileSync(`${root}/.env`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const cmd = process.argv[2]
const WS = process.env.WS ?? 'af91555d-7450-4b21-a8ac-73db092617c8'

if (cmd === 'inspect') {
  console.log(await prisma.$queryRawUnsafe(`select column_name, data_type from information_schema.columns where table_name='workspaces' and column_name in ('default_approval_workflow_id','po_mismatch_approver_ids')`))
  console.log(await prisma.$queryRawUnsafe(`select conname from pg_constraint where conname='workspaces_default_approval_workflow_id_fkey'`))
  console.log(await prisma.$queryRawUnsafe(`select indexname from pg_indexes where indexname='workspaces_default_approval_workflow_id_idx'`))
  console.log(await prisma.$queryRawUnsafe(`select migration_name, finished_at, rolled_back_at from _prisma_migrations order by started_at desc limit 3`))
} else if (cmd === 'fix') {
  // Apply whatever part of the migration is missing, idempotently.
  await prisma.$executeRawUnsafe(`ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "po_mismatch_approver_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[]`)
  await prisma.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (select 1 from pg_constraint where conname='workspaces_default_approval_workflow_id_fkey') THEN ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_default_approval_workflow_id_fkey" FOREIGN KEY ("default_approval_workflow_id") REFERENCES "approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "workspaces_default_approval_workflow_id_idx" ON "workspaces"("default_approval_workflow_id")`)
  console.log('fixed')
} else if (cmd === 'resolve') {
  const r = spawnSync('npx', ['prisma', 'migrate', 'resolve', '--applied', '20260916060000_add_default_approval_flow_and_mismatch_approvers'], { cwd: root, env: process.env, encoding: 'utf8' })
  console.log(r.stdout, r.stderr)
} else if (cmd === 'seed') {
  const ws = await prisma.workspace.findUnique({ where: { id: WS }, select: { id: true, name: true, defaultApprovalWorkflowId: true, poMismatchApproverIds: true, poQuantityTolerancePercent: true } })
  console.log('workspace', ws)
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId: WS }, select: { userId: true, role: true, user: { select: { name: true, email: true } } } })
  console.log('members', members.map((m) => `${m.role}:${m.user.name ?? m.user.email}`))
  const flows = await prisma.approvalWorkflow.findMany({ where: { workspaceId: WS }, select: { id: true, name: true, active: true, stages: { select: { id: true } } } })
  console.log('flows', flows.map((f) => `${f.name} (${f.active ? 'active' : 'inactive'}, ${f.stages.length} stages)`))
  if (flows.length < 2) {
    const owner = members.find((m) => m.role === 'owner')
    const mk = async (name, active, stages) => prisma.approvalWorkflow.create({ data: { workspaceId: WS, name, active, stages: { create: stages.map((s, i) => ({ name: s.name, stageIndex: i, workspaceId: WS, requireOwner: s.requireOwner ?? false, approverIds: s.approverIds ?? [] })) } } })
    if (!flows.some((f) => f.name === 'Two-step finance approval')) await mk('Two-step finance approval', true, [{ name: 'Bookkeeper check' }, { name: 'Finance sign-off', requireOwner: true }])
    if (!flows.some((f) => f.name === 'Legacy single sign-off')) await mk('Legacy single sign-off', false, [{ name: 'Owner sign-off', requireOwner: true, approverIds: owner ? [owner.userId] : [] }])
    console.log('seeded flows')
  }
  if (members.length < 3) {
    for (const [name, email] of [['Priya Natarajan', 'priya@example.test'], ['Tomás Ferreira', 'tomas@example.test']]) {
      const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name } })
      await prisma.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: WS, userId: user.id } }, update: {}, create: { workspaceId: WS, userId: user.id, role: 'member' } })
    }
    console.log('seeded 2 members')
  }
  const tasks = await prisma.reviewTask.count({ where: { workspaceId: WS, workflowId: null, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } } })
  console.log('review tasks without workflow in last 30 days', tasks)
} else if (cmd === 'set-inactive-default') {
  const flow = await prisma.approvalWorkflow.findFirst({ where: { workspaceId: WS, active: false } })
  await prisma.workspace.update({ where: { id: WS }, data: { defaultApprovalWorkflowId: flow?.id ?? null } })
  console.log('default set to inactive flow', flow?.name)
} else if (cmd === 'role') {
  // Flip the dev-bypass user's role so the read-only member view can be captured.
  const dev = await prisma.user.findFirst({ where: { email: 'dev@docubite.local' }, select: { id: true } })
  if (!dev) throw new Error('no dev user')
  const role = process.argv[3] ?? 'owner'
  await prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: WS, userId: dev.id } }, data: { role } })
  // A workspace needs an owner for the ReadOnlyBand to name; promote Priya while the dev user is a member.
  const priya = await prisma.user.findFirst({ where: { email: 'priya@example.test' }, select: { id: true } })
  if (priya) await prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: WS, userId: priya.id } }, data: { role: role === 'owner' ? 'member' : 'owner' } })
  console.log('dev user role', role)
} else if (cmd === 'set-active-default') {
  const flow = await prisma.approvalWorkflow.findFirst({ where: { workspaceId: WS, active: true } })
  await prisma.workspace.update({ where: { id: WS }, data: { defaultApprovalWorkflowId: flow?.id ?? null } })
  console.log('default set to active flow', flow?.name)
} else if (cmd === 'clear-default') {
  await prisma.workspace.update({ where: { id: WS }, data: { defaultApprovalWorkflowId: null, poMismatchApproverIds: [] } })
  console.log('cleared')
}
await prisma.$disconnect()

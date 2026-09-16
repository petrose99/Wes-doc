// Autopilot helper (#252): probe Admin routes and the legacy 308s against the dev server.
const WS = process.env.WS ?? 'af91555d-7450-4b21-a8ac-73db092617c8'
const base = `http://localhost:3000/workspaces/${WS}`
const paths = process.argv.slice(2).length ? process.argv.slice(2) : [
  'admin', 'admin/configuration', 'admin/configuration?type=receipt', 'admin/configuration/autonomy', 'admin/configuration/checks', 'admin/configuration/report',
  'admin/configuration/intake', 'admin/configuration/tax', 'admin/configuration/payments', 'admin/configuration/whats-on',
  'admin/approval-flows', 'admin/po-mismatch-flows', 'admin/suppliers', 'admin/integrations', 'admin/users', 'admin/companies',
  'account', 'account/security',
  'settings/workspace', 'settings/modules', 'settings/rules', 'settings/tax', 'settings/email', 'settings/payments', 'settings/templates', 'settings/security', 'settings',
  'automation', 'automation/settings', 'automation/warn-checks', 'automation/vendors', 'automation/approvals', 'automation/matches',
]
for (const p of paths) {
  const t0 = Date.now()
  try {
    const res = await fetch(`${base}/${p}`, { redirect: 'manual', signal: AbortSignal.timeout(300000) })
    const loc = res.headers.get('location') ?? ''
    let note = ''
    if (res.status === 200) {
      const html = await res.text()
      const h1 = (html.match(/<h1[^>]*>(.*?)<\/h1>/s) ?? [])[1]?.replace(/<[^>]+>/g, '') ?? '(no h1)'
      const mains = (html.match(/<main[\s>]/g) ?? []).length
      note = `h1="${h1}" main=${mains}`
    }
    console.log(`${p} → ${res.status} ${loc.replace(base, '')} ${note} ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  } catch (e) { console.log(`${p} → ERR ${e.message}`) }
}

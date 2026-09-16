import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Empty, Panel } from "@/components/automation/automation-ui"
import { ReportTemplateForm } from "@/components/dictation/report-template-form"
import { DomainPackPicker } from "@/components/workspace/domain-pack-picker"
import { ModuleRow } from "@/components/workspace/module-row"
import { TemplateForm } from "@/components/workspace/template-form"
import { getAdminContext } from "@/lib/admin/context"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { extractionDomainPacks } from "@/lib/domains"
import { INDUSTRIES, modulesForIndustry } from "@/lib/modules"
import { UNPLUGGED_SEGMENTS } from "@/lib/unplugged"
import { parseNarrativeSections } from "@/lib/report-render/narrative"
import { parseSynopticFields } from "@/lib/report-render/synoptic"
import { listFiles } from "@/models/files"
import { getWorkspaceModuleOverrides } from "@/models/modules"
import { ensureWorkspaceReportTemplates, listReportTemplates } from "@/models/report-templates"
import type { Industry } from "@/types/industry"

export const dynamic = "force-dynamic"

/** Modules whose only surface is unplugged (#238) do not appear in the catalog: a switch for a
 * feature that cannot be reached is a switch that does nothing. */
const UNPLUGGED_MODULE_KEYS = new Set(["expense-approvals", "dictation", "sheets"])
const unpluggedNav = (module: { navItems?: { href: string }[] }) => module.navItems?.some((item) => (UNPLUGGED_SEGMENTS as readonly string[]).includes(item.href.split("/")[0])) ?? false

/** #231 Q10 (#252): Admin › Configuration › What's on — the modules catalog in the admin
 * grammar, followed by the two sections whose fate waits on the owner's signature (#256):
 * document templates and report templates stay reachable here until then. */
export default async function WhatsOnPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const owner = context.owner
  const industry = context.workspace.industry as Industry
  const capabilities = context.capabilities
  const industryLabel = INDUSTRIES.find((entry) => entry.key === industry)?.label ?? "this"

  const [overrideRows, files, templates, reportTemplates] = await Promise.all([
    getWorkspaceModuleOverrides(workspaceId),
    listFiles(workspaceId, { sort: "name", dir: "asc" }),
    prisma.documentTemplate.findMany({ where: { workspaceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
    capabilities.has("dictation") ? ensureWorkspaceReportTemplates(workspaceId).then(() => listReportTemplates(workspaceId)) : Promise.resolve([]),
  ])
  const overrides = new Map(overrideRows.map((row) => [row.moduleKey, row]))
  const candidates = modulesForIndustry(industry).filter((module) => !UNPLUGGED_MODULE_KEYS.has(module.key) && !unpluggedNav(module))
  const included = candidates.filter((module) => module.tier === "always" || (module.tier === "default" && capabilities.has(module.key)))
  const turnedOff = candidates.filter((module) => module.tier === "default" && !capabilities.has(module.key))
  const optional = candidates.filter((module) => module.tier === "optional")
  const byFile = new Map(files.map((file) => [file.id, templates.filter((template) => template.fileId === file.id)]))
  const domainPacks = extractionDomainPacks()

  return <AdminPage title="What's on" intro={`What is turned on for ${context.workspace.name}. Turning a module off hides it; nothing already in it is deleted.`}>
    {!owner && <ReadOnlyBand owners={context.owners} />}

    <Panel title="Included" note={`On by default for a ${industryLabel} company.`}>
      <div className="divide-y divide-hairline-soft">
        {[...included, ...turnedOff].map((module) => (
          <ModuleRow key={module.key} workspaceId={workspaceId} moduleKey={module.key} name={module.name} description={module.description}
            kind={module.tier === "optional" ? "optional" : "default"} enabled={capabilities.has(module.key)} owner={owner} activation={module.activation} requestedBy={null} />
        ))}
      </div>
    </Panel>

    {optional.length > 0 && <Panel title="Optional" note="Not on by default — turn one on, or ask an owner to.">
      <div className="divide-y divide-hairline-soft">
        {optional.map((module) => {
          const override = overrides.get(module.key)
          return <ModuleRow key={module.key} workspaceId={workspaceId} moduleKey={module.key} name={module.name} description={module.description}
            kind="optional" enabled={capabilities.has(module.key)} owner={owner} activation={module.activation}
            requestedBy={override?.status === "requested" && override.requestedBy ? override.requestedBy : null} />
        })}
      </div>
    </Panel>}

    <Panel title="Document templates" note="What each worksheet extracts. Kept here while worksheets are unplugged; custom fields defined on a template appear under Fields.">
      {!files.length
        ? <Empty title="No document templates">Templates belong to a worksheet file, and this company has none.</Empty>
        : <div className="space-y-6">
          {files.map((file) => {
            const fileTemplates = byFile.get(file.id) || []
            const presentCodes = new Set(fileTemplates.map((template) => template.code))
            const availablePacks = domainPacks.filter((pack) => pack.adapters.some((adapter) => !presentCodes.has(adapter.code)))
            return <div key={file.id}>
              <p className="text-sm font-medium text-slate-900">{file.name} <span className="font-normal text-slate-500">· {fileTemplates.length} worksheet{fileTemplates.length === 1 ? "" : "s"}</span></p>
              <ul className="mt-2 divide-y divide-hairline-soft text-sm">
                {fileTemplates.map((template) => <li key={template.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-slate-900">{template.name}</span>
                  <span className="text-xs text-slate-500">{template.isSystem ? "System" : `Custom · version ${template.currentVersion}`}</span>
                </li>)}
              </ul>
              {owner && <div className="mt-2"><DomainPackPicker workspaceId={workspaceId} fileId={file.id} packs={availablePacks} /></div>}
            </div>
          })}
          {owner && <div>
            <p className="mb-2 text-sm font-medium text-slate-900">Create a custom template</p>
            <TemplateForm workspaceId={workspaceId} files={files.map((file) => ({ id: file.id, name: file.name }))} />
          </div>}
        </div>}
    </Panel>

    {config.asr.enabled && capabilities.has("dictation") && <Panel title="Report templates" note="The format a dictation is drafted into. Kept here while dictation is unplugged.">
      <div className="space-y-6">
        {reportTemplates.map((template) => <div key={template.id}>
          <p className="text-sm font-medium text-slate-900">{template.name}</p>
          <p className="text-xs text-slate-500">{template.specimenType ? `Used for ${template.specimenType} specimens.` : "The fallback when no template matches the dictated specimen type."}</p>
          <div className="mt-2">
            {owner
              ? <ReportTemplateForm workspaceId={workspaceId} templateId={template.id} synopticFields={parseSynopticFields(template.synopticFields)} narrativeSections={parseNarrativeSections(template.narrativeSections)} />
              : <ul className="text-sm text-slate-700">{parseSynopticFields(template.synopticFields).map((field) => <li key={field.key}>{field.label}{field.required ? " (required)" : ""}</li>)}</ul>}
          </div>
        </div>)}
      </div>
    </Panel>}
  </AdminPage>
}

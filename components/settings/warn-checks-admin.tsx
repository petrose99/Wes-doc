"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  createWarnCheckAction,
  deleteWarnCheckAction,
  dryRunWarnChecksAction,
  setWarnCheckEnabledAction,
  updateWarnCheckAction,
} from "@/app/(app)/workspaces/[workspaceId]/automation/warn-checks/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { WARN_CHECK_VARIABLES } from "@/lib/gates/warn-checks-evaluator"
import type { DryRunResult } from "@/models/warn-checks"

export type WarnCheckRow = {
  id: string
  name: string
  whenExpr: string
  message: string
  enabled: boolean
  createdAt: string
  author: string
}

/** Owner-only admin for workspace warn checks (ticket #56).
 *
 * Three surfaces, top-to-bottom:
 *   1. The current rule set as a compact table — one row per rule with inline toggle + edit +
 *      delete. Ledger, not cards: the eye should scan down the whenExpr column, not around
 *      shadowed boxes.
 *   2. A create form. The dry-run button on the form previews the candidate rule against the
 *      last 20 invoices before saving — the whole point of ticket #56's "Dry-run against the
 *      last 20 bills so admins see what would have fired".
 *   3. A help block naming every allowed variable and operator; the DSL is narrow enough that
 *      an admin authoring rules can hold the whole surface in view. */
export function WarnChecksAdmin({
  workspaceId,
  initial,
}: {
  workspaceId: string
  initial: WarnCheckRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)

  const refresh = () => startTransition(() => router.refresh())

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg font-semibold text-slate-900">Rules</h2>
        {initial.length === 0 ? (
          <p className="mt-3 max-w-[54ch] text-sm text-slate-600">
            No warn checks yet. Add one below to hold matching bills in the exception queue with
            your own wording — they never block, and they never post.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[#e6ebf1] border-y border-[#e6ebf1]">
            {initial.map((row) =>
              editingId === row.id ? (
                <li key={row.id} className="py-4">
                  <WarnCheckForm
                    workspaceId={workspaceId}
                    mode="edit"
                    initial={row}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null)
                      refresh()
                    }}
                  />
                </li>
              ) : (
                <li key={row.id} className="grid grid-cols-[1fr_auto] items-start gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-3">
                      <span className={`text-sm font-medium ${row.enabled ? "text-slate-900" : "text-slate-500 line-through"}`}>
                        {row.name}
                      </span>
                      <span className="text-xs text-slate-500">by {row.author}</span>
                    </div>
                    <code className="mt-1 block font-mono text-xs text-slate-700 break-all">{row.whenExpr}</code>
                    <p className="mt-1 text-xs text-slate-600">{row.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await setWarnCheckEnabledAction({
                            workspaceId,
                            id: row.id,
                            enabled: !row.enabled,
                          })
                          if ("error" in result) toast.error(result.error)
                          else refresh()
                        })
                      }
                    >
                      {row.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(row.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete "${row.name}"? Past firings stay in history.`)) return
                        startTransition(async () => {
                          const result = await deleteWarnCheckAction({ workspaceId, id: row.id })
                          if ("error" in result) toast.error(result.error)
                          else refresh()
                        })
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-slate-900">Add a warn check</h2>
        <p className="mt-2 max-w-[64ch] text-sm text-slate-600">
          Predicates use a small expression language over the fields below. The dry-run tries
          the rule against the last 20 invoices so you can see what would have fired before
          turning it on.
        </p>
        <div className="mt-4">
          <WarnCheckForm workspaceId={workspaceId} mode="create" onSaved={refresh} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-slate-900">Reference</h2>
        <p className="mt-2 max-w-[64ch] text-sm text-slate-600">
          Variables (available in every rule):
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 md:grid-cols-3">
          {Object.entries(WARN_CHECK_VARIABLES).map(([name, type]) => (
            <li key={name} className="font-mono text-slate-700">
              {name}
              <span className="text-slate-400"> : {type}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[64ch] text-sm text-slate-600">
          Operators: <code className="font-mono">==</code> <code className="font-mono">!=</code>{" "}
          <code className="font-mono">&lt;</code> <code className="font-mono">&lt;=</code>{" "}
          <code className="font-mono">&gt;</code> <code className="font-mono">&gt;=</code>{" "}
          <code className="font-mono">contains</code> <code className="font-mono">and</code>{" "}
          <code className="font-mono">or</code> <code className="font-mono">not</code>.
          Numbers, single- or double-quoted strings, <code className="font-mono">true</code>,{" "}
          <code className="font-mono">false</code>, and parentheses. No arithmetic, no regex, no
          arbitrary code — a rule that needs it belongs alongside the built-in gates in
          <code className="font-mono">lib/gates/</code>.
        </p>
      </section>
    </div>
  )
}

function WarnCheckForm({
  workspaceId,
  mode,
  initial,
  onSaved,
  onCancel,
}: {
  workspaceId: string
  mode: "create" | "edit"
  initial?: WarnCheckRow
  onSaved: () => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [whenExpr, setWhenExpr] = useState(initial?.whenExpr ?? "")
  const [message, setMessage] = useState(initial?.message ?? "")
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [dryRun, setDryRun] = useState<DryRunResult[] | null>(null)

  const submit = () =>
    startTransition(async () => {
      setError(null)
      const result =
        mode === "create"
          ? await createWarnCheckAction({
              workspaceId,
              data: { name, whenExpr, message },
            })
          : await updateWarnCheckAction({
              workspaceId,
              id: initial!.id,
              patch: { name, whenExpr, message },
            })
      if ("error" in result) {
        setError({ field: result.field, message: result.error })
        return
      }
      if (mode === "create") {
        setName("")
        setWhenExpr("")
        setMessage("")
        setDryRun(null)
      }
      toast.success(mode === "create" ? "Warn check added." : "Warn check saved.")
      onSaved()
    })

  const preview = () =>
    startTransition(async () => {
      setError(null)
      const result = await dryRunWarnChecksAction({
        workspaceId,
        candidate: { name: name || "candidate", whenExpr, message: message || "-" },
      })
      if ("error" in result) {
        setError({ field: "whenExpr", message: result.error })
        setDryRun(null)
        return
      }
      setDryRun(result.results)
    })

  const firedCount = dryRun?.filter((r) => r.outcomes.some((o) => o.status === "fired")).length ?? 0
  const erroredCount = dryRun?.filter((r) => r.outcomes.some((o) => o.status === "errored")).length ?? 0

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${mode}-name`} className="text-sm">Name</Label>
        <Input
          id={`${mode}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Large bill from an unknown vendor"
          maxLength={120}
        />
      </div>
      <div>
        <Label htmlFor={`${mode}-when`} className="text-sm">Predicate</Label>
        <Textarea
          id={`${mode}-when`}
          value={whenExpr}
          onChange={(e) => setWhenExpr(e.target.value)}
          placeholder='total > 1000 and not supplierKnown'
          className="font-mono text-sm"
          rows={2}
        />
        {error && error.field === "whenExpr" && (
          <p className="mt-1 text-xs text-red-600">{error.message}</p>
        )}
      </div>
      <div>
        <Label htmlFor={`${mode}-message`} className="text-sm">Message shown to the reviewer</Label>
        <Input
          id={`${mode}-message`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Verify this vendor before publishing."
          maxLength={1024}
        />
      </div>

      {dryRun && (
        <div className="rounded border border-[#e6ebf1] p-3 text-xs">
          <p className="mb-2 text-slate-600">
            Dry-run against the last {dryRun.length} invoice{dryRun.length === 1 ? "" : "s"}:{" "}
            <span className="font-medium text-slate-900">
              {firedCount} would have fired
            </span>
            {erroredCount > 0 && <span className="text-red-600">, {erroredCount} errored</span>}.
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto font-mono">
            {dryRun.map((r) => {
              const status = r.outcomes.some((o) => o.status === "fired")
                ? "fired"
                : r.outcomes.some((o) => o.status === "errored")
                  ? "errored"
                  : "passed"
              return (
                <li key={r.documentId} className="flex gap-3 text-slate-700">
                  <span
                    className={
                      status === "fired"
                        ? "text-amber-700"
                        : status === "errored"
                          ? "text-red-700"
                          : "text-slate-400"
                    }
                  >
                    {status.padEnd(7)}
                  </span>
                  <span className="truncate">{r.vendor ?? "(no vendor)"}</span>
                  <span className="text-slate-500">
                    {r.total !== null ? `${r.total} ${r.currency ?? ""}` : ""}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {error && error.field !== "whenExpr" && (
        <p className="text-sm text-red-600">{error.message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={submit} disabled={pending || !name || !whenExpr || !message}>
          {mode === "create" ? "Add warn check" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={preview}
          disabled={pending || !whenExpr}
        >
          Dry-run
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

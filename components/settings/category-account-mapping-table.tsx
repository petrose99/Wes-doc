"use client"

import { upsertMappingAction, deleteMappingAction } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/settings/accounting-mapping/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CategoryAccountMappingRow } from "@/models/category-account-mappings"
import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

export function CategoryAccountMappingTable({ workspaceId, connectionId, mappings, accountOptions, categories, isOwner }: {
  workspaceId: string
  connectionId: string
  mappings: CategoryAccountMappingRow[]
  accountOptions: { value: string; label: string }[]
  categories: string[]
  isOwner: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [newCategory, setNewCategory] = useState("")
  const [newAccountId, setNewAccountId] = useState("")
  const [newKind, setNewKind] = useState<"expense" | "income">("expense")

  const unmappedCategories = categories.filter((c) => !mappings.some((m) => m.category === c && m.kind === newKind))

  const save = () => {
    if (!newCategory || !newAccountId) return
    startTransition(async () => {
      const res = await upsertMappingAction(workspaceId, connectionId, newCategory, newKind, newAccountId)
      if (res.success) {
        toast.success("Mapping saved")
        setNewCategory("")
        setNewAccountId("")
        router.refresh()
      } else {
        toast.error(res.error || "Could not save mapping")
      }
    })
  }

  const remove = (mappingId: string) => startTransition(async () => {
    const res = await deleteMappingAction(workspaceId, connectionId, mappingId)
    if (res.success) { toast.success("Mapping removed"); router.refresh() }
    else toast.error(res.error || "Could not remove mapping")
  })

  const accountLabel = (externalId: string) => accountOptions.find((o) => o.value === externalId)?.label ?? externalId

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category → Account mappings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mappings.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Account</th>
                {isOwner && <th className="pb-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2">{m.category}</td>
                  <td className="py-2 capitalize">{m.kind}</td>
                  <td className="py-2">{accountLabel(m.accountExternalId)}</td>
                  {isOwner && (
                    <td className="py-2">
                      <button type="button" disabled={pending} onClick={() => remove(m.id)}
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {mappings.length === 0 && <p className="text-sm text-muted-foreground">No mappings configured yet. Categories will use the default expense account.</p>}

        {isOwner && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
                <option value="">Select category…</option>
                {unmappedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Type</label>
              <select value={newKind} onChange={(e) => setNewKind(e.target.value as "expense" | "income")}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Account</label>
              <select value={newAccountId} onChange={(e) => setNewAccountId(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
                <option value="">Select account…</option>
                {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={pending || !newCategory || !newAccountId} onClick={save}>
              <Plus className="mr-1 h-4 w-4" />Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

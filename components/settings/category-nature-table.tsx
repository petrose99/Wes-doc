"use client"

import {
  upsertCategoryNatureAction,
  deleteCategoryNatureAction,
} from "@/app/(app)/workspaces/[workspaceId]/(chrome)/settings/categories/actions"
import { Button } from "@/components/ui/button"
import type { CategoryNatureRow, CategoryNature } from "@/models/category-natures"
import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

export function CategoryNatureTable({
  workspaceId,
  rows,
  isOwner,
}: {
  workspaceId: string
  rows: CategoryNatureRow[]
  isOwner: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [newCategory, setNewCategory] = useState("")
  const [newNature, setNewNature] = useState<CategoryNature>("goods")

  const save = () => {
    if (!newCategory.trim()) return
    startTransition(async () => {
      const res = await upsertCategoryNatureAction(workspaceId, newCategory.trim(), newNature)
      if (res.success) {
        toast.success("Category saved")
        setNewCategory("")
        router.refresh()
      } else {
        toast.error(res.error || "Could not save category")
      }
    })
  }

  const changeNature = (id: string, category: string, nature: CategoryNature) => {
    startTransition(async () => {
      const res = await upsertCategoryNatureAction(workspaceId, category, nature)
      if (res.success) {
        router.refresh()
      } else {
        toast.error(res.error || "Could not update category")
      }
    })
  }

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteCategoryNatureAction(workspaceId, id)
      if (res.success) {
        toast.success("Category removed")
        router.refresh()
      } else {
        toast.error(res.error || "Could not remove category")
      }
    })

  return (
    <div className="space-y-4">
      {rows.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 font-medium">Nature</th>
              {isOwner && <th className="pb-2 w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2">{r.category}</td>
                <td className="py-2">
                  {isOwner ? (
                    <select
                      value={r.nature}
                      onChange={(e) => changeNature(r.id, r.category, e.target.value as CategoryNature)}
                      disabled={pending}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                    >
                      <option value="goods">Goods</option>
                      <option value="services">Services</option>
                    </select>
                  ) : (
                    <span className="capitalize">{r.nature}</span>
                  )}
                </td>
                {isOwner && (
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(r.id)}
                      className="rounded p-1 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                      aria-label={`Remove ${r.category}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">
          No categories classified yet. Bills project as unset until you add rows here.
        </p>
      )}

      {isOwner && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Category</label>
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. software"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Nature</label>
            <select
              value={newNature}
              onChange={(e) => setNewNature(e.target.value as CategoryNature)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="goods">Goods</option>
              <option value="services">Services</option>
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !newCategory.trim()}
            onClick={save}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
      )}
    </div>
  )
}

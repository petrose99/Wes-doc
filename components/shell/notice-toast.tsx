"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"

const NOTICE_TEXT: Record<string, (name: string) => string> = {
  deleted: (name) => `${name} deleted`,
  left: (name) => `You left ${name}`,
}

/** #285 spec §4.6: Delete/Leave hard-navigate to `/workspaces?notice=…&name=…` (the pane's own
 * membership is gone the instant either succeeds, so a soft toast racing that navigation would
 * never render) and the params ride the `/workspaces` → `/workspaces/{id}` → `/workspaces/{id}/…`
 * redirect chain to wherever the viewer actually lands. This is that chain's single consumer,
 * mounted once for the whole signed-in app (`app/(app)/layout.tsx`) alongside the `Toaster`. */
export function NoticeToast() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const notice = searchParams.get("notice")
    const name = searchParams.get("name")
    if (!notice || !name || !(notice in NOTICE_TEXT)) return
    toast.success(NOTICE_TEXT[notice](name))
    router.replace(pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return null
}

import { InstallPrompt } from "@/components/shell/install-prompt"
import { NoticeToast } from "@/components/shell/notice-toast"
import { Toaster } from "@/components/ui/sonner"
import { getCurrentUser } from "@/lib/auth"
import { Suspense } from "react"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await getCurrentUser()
  // Mounted once for the whole signed-in app so the workspace list and settings pages can
  // toast too, not just the sheet.
  return <><InstallPrompt />{children}<Suspense><NoticeToast /></Suspense><Toaster richColors position="bottom-right" /></>
}

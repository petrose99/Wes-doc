import { MarketingFooter } from "@/components/marketing/footer"
import { MarketingNav } from "@/components/marketing/nav"

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <MarketingNav />
      <main id="main-content" className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}

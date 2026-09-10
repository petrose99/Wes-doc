"use client"

import { Button } from "@/components/ui/button"
import * as Sentry from "@sentry/nextjs"
import { Ghost } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const digest = error.digest
  const supportHref = `mailto:support@docubite.app?subject=${encodeURIComponent("DocuBite error")}${digest ? `&body=${encodeURIComponent(`Error reference: ${digest}`)}` : ""}`

  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
          <div className="text-center space-y-4">
            <Ghost className="w-24 h-24 text-destructive mx-auto" />
            <h1 className="text-4xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              We hit an unexpected error. Our team has been notified — try again, or reach out if it keeps happening.
            </p>
            {digest && <p className="text-xs text-muted-foreground font-mono">Reference: {digest}</p>}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-2">
              <Button type="button" onClick={() => reset()}>Try again</Button>
              <Button asChild variant="outline">
                <Link href="/">Go home</Link>
              </Button>
              <Button asChild variant="outline">
                <a href={supportHref}>Contact support</a>
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

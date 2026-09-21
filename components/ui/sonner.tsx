"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // #251: sonner's richColors success (#008a2e on #ecfdf3) is 4.3:1; emerald-800 on the
          // same tint clears 4.5:1 without changing the toast's reading.
          success: "group-[.toaster]:!text-emerald-800 group-[.toaster]:[&_svg]:!text-emerald-700",
          // #374: same shortfall on the error variant (#e60000 on #fff0f0 is 4.3:1, surfaced by
          // the WhatsApp add-sender validation toasts) — red-800 on the same tint clears 4.5:1.
          error: "group-[.toaster]:!text-red-800 group-[.toaster]:[&_svg]:!text-red-700",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

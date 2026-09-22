import type { HTMLAttributes, ReactNode } from "react"

/** #231 Q21 (#252): Card is retired from Admin. Components that were written against shadcn's
 * Card API (IntegrationsManager, the account-mapping table) keep their markup and swap this
 * import in: the same five names render the Panel grammar — a rule and a heading, no shadowed
 * box — so a page with several of them still reads as one object. */

export function Card({ children, className = "", ...rest }: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  return <section className={className} {...rest}>{children}</section>
}

export function CardHeader({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={`border-b border-hairline pb-2.5 ${className}`}>{children}</div>
}

export function CardTitle({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <h2 className={`text-[15px] font-semibold text-slate-900 ${className}`}>{children}</h2>
}

export function CardDescription({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <p className={`mt-1 max-w-[62ch] text-[13px] leading-relaxed text-slate-500 ${className}`}>{children}</p>
}

export function CardContent({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={`pt-4 ${className}`}>{children}</div>
}

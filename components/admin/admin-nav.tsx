"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, type KeyboardEvent } from "react"

export type AdminNavItem = { href: string; label: string; children?: { href: string; label: string }[] }
export type AdminNavGroup = { caption: string; items: AdminNavItem[] }

/** #231 Q20 (#252): the Admin area's left nav — Vic's two captioned groups, ORGANIZATION and the
 * company's name, inside the work area. A left nav rather than the incumbent tab strip because
 * the strip wrapped to two lines at 1440 and three at 390 (critique H8). Configuration's
 * sections nest under it and only unfold while one of them is open, so the list stays short.
 *
 * The caption is the company name, not "Company": an accountant with six clients configures the
 * wrong one otherwise (Priya, PRODUCT.md).
 *
 * One Tab stop (#240's rule for the queue rows, applied here): the current link is the only
 * tabbable one; ↑/↓ and Home/End move inside the nav, Enter follows. The rail before it already
 * costs sixteen Tabs; this nav must not cost fifteen more. */
export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const links = useRef<(HTMLAnchorElement | null)[]>([])

  // The flat order of every rendered link, for the arrow keys.
  const flat: { href: string; label: string; depth: 0 | 1; parent?: string }[] = []
  for (const group of groups) for (const item of group.items) {
    flat.push({ href: item.href, label: item.label, depth: 0 })
    if (item.children && isActive(item.href)) for (const child of item.children) flat.push({ href: child.href, label: child.label, depth: 1, parent: item.href })
  }
  const currentIndex = Math.max(0, flat.findIndex((entry) => pathname === entry.href))
  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const last = flat.length - 1
    const target = event.key === "ArrowDown" ? Math.min(last, index + 1)
      : event.key === "ArrowUp" ? Math.max(0, index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null
    if (target === null) return
    event.preventDefault()
    links.current[target]?.focus()
  }

  const linkClass = (depth: 0 | 1, active: boolean, exact: boolean) => depth === 0
    ? `relative flex h-8 items-center rounded-md px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? "font-medium text-emerald-800" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"}`
    : `flex h-7 items-center rounded-md pl-6 pr-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${exact ? "bg-emerald-50 font-medium text-emerald-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`

  let cursor = 0
  return <nav aria-label="Admin" className="hidden w-[208px] shrink-0 border-r border-hairline bg-white md:block">
    <div className="sticky top-0 px-3 py-6">
      {groups.map((group, groupIndex) => (
        <div key={group.caption} className="mb-6 last:mb-0">
          <p id={`admin-group-${groupIndex}`} className="mb-1.5 break-words px-2.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-slate-500">{group.caption}</p>
          <ul className="space-y-px" role="group" aria-labelledby={`admin-group-${groupIndex}`}>
            {group.items.map((item) => {
              const active = isActive(item.href)
              const exact = pathname === item.href
              const index = cursor++
              return <li key={item.href}>
                <Link href={item.href} aria-current={exact ? "page" : undefined} tabIndex={index === currentIndex ? 0 : -1}
                  ref={(element) => { links.current[index] = element }} onKeyDown={(event) => onKeyDown(event, index)}
                  className={linkClass(0, active, exact)}>
                  {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-emerald-700" aria-hidden />}
                  <span className="truncate">{item.label}</span>
                </Link>
                {item.children && active && (
                  <ul className="mb-1 mt-0.5 space-y-px" aria-label={`${item.label} sections`}>
                    {item.children.map((child) => {
                      const childExact = pathname === child.href
                      const childIndex = cursor++
                      return <li key={child.href}>
                        <Link href={child.href} aria-current={childExact ? "page" : undefined} tabIndex={childIndex === currentIndex ? 0 : -1}
                          ref={(element) => { links.current[childIndex] = element }} onKeyDown={(event) => onKeyDown(event, childIndex)}
                          className={linkClass(1, false, childExact)}>
                          {child.label}
                        </Link>
                      </li>
                    })}
                  </ul>
                )}
              </li>
            })}
          </ul>
        </div>
      ))}
    </div>
  </nav>
}

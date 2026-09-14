import Link from "next/link"
import type { ReactNode } from "react"

type ResourceBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; text: string }

function renderInline(text: string): ReactNode[] {
  const pieces = text.split(/(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return pieces.map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) return <strong key={index}>{piece.slice(2, -2)}</strong>
    if (piece.startsWith("`") && piece.endsWith("`")) return <code key={index} className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em] text-slate-800">{piece.slice(1, -1)}</code>
    const link = piece.match(/^\[([^\]]+)\]\(([^\)]+)\)$/)
    if (link) {
      const [, label, href] = link
      if (href!.startsWith("/")) {
        return <Link key={index} href={href!} className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:decoration-emerald-700">{label}</Link>
      }
      if (/^https?:\/\//.test(href!)) {
        return <a key={index} href={href!} target="_blank" rel="noreferrer" className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:decoration-emerald-700">{label}</a>
      }
    }
    return <span key={index}>{piece}</span>
  })
}

function parseBlocks(markdown: string): ResourceBlock[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: ResourceBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]!.trim()
    if (!line) { index += 1; continue }

    const codeStart = line === "```"
    if (codeStart) {
      index += 1
      const code: string[] = []
      while (index < lines.length && lines[index]!.trim() !== "```") { code.push(lines[index]!); index += 1 }
      index += 1
      blocks.push({ kind: "code", text: code.join("\n") })
      continue
    }

    const heading = line.match(/^(#{2,3})\s+(.+)$/)
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length as 2 | 3, text: heading[2]! })
      index += 1
      continue
    }

    if (line.startsWith("> ")) {
      blocks.push({ kind: "quote", text: line.slice(2) })
      index += 1
      continue
    }

    const unordered = line.match(/^[-*]\s+(.+)$/)
    const ordered = line.match(/^\d+\.\s+(.+)$/)
    if (unordered || ordered) {
      const items: string[] = []
      const isOrdered = Boolean(ordered)
      while (index < lines.length) {
        const candidate = lines[index]!.trim()
        const match = isOrdered ? candidate.match(/^\d+\.\s+(.+)$/) : candidate.match(/^[-*]\s+(.+)$/)
        if (!match) break
        items.push(match[1]!)
        index += 1
      }
      blocks.push({ kind: "list", ordered: isOrdered, items })
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index]!.trim()) {
      const next = lines[index]!.trim()
      if (/^(#{2,3})\s+/.test(next) || next.startsWith("> ") || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next) || next === "```") break
      paragraph.push(next)
      index += 1
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") })
  }

  return blocks
}

export function ResourceContent({ markdown }: { markdown: string }) {
  return (
    <div className="resource-prose text-[1.125rem] leading-8 text-slate-700">
      {parseBlocks(markdown).map((block, index) => {
        if (block.kind === "heading") {
          const Heading = block.level === 2 ? "h2" : "h3"
          return <Heading key={index} className={block.level === 2 ? "mt-12 font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-slate-950 first:mt-0" : "mt-9 font-display text-2xl font-bold leading-tight tracking-[-0.02em] text-slate-950"}>{renderInline(block.text)}</Heading>
        }
        if (block.kind === "quote") return <blockquote key={index} className="my-8 border-y border-slate-200 py-5 font-display text-xl font-semibold leading-snug text-slate-900">{renderInline(block.text)}</blockquote>
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul"
          return <List key={index} className={`${block.ordered ? "list-decimal" : "list-disc"} my-6 space-y-2 pl-6 marker:text-emerald-700`}>{block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{renderInline(item)}</li>)}</List>
        }
        if (block.kind === "code") return <pre key={index} className="my-7 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm leading-6 text-slate-100"><code>{block.text}</code></pre>
        return <p key={index} className="my-6 first:mt-0">{renderInline(block.text)}</p>
      })}
    </div>
  )
}

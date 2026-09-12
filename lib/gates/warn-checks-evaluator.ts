/** Narrow, safe expression language for the workspace-authored warn checks (ticket #56, gate
 * 6/6 from decision #40).
 *
 * The design constraint is that a workspace admin is authoring these — the language must be
 * unable to execute arbitrary code, reach into the database, or reference an unknown field. So
 * this is NOT eval, NOT a sandboxed JS runtime, and NOT a general expression library like
 * jsonata. It's a hand-rolled recursive-descent parser + tree-walking evaluator over a fixed
 * set of typed variables. Anything the parser doesn't recognise is a parse error surfaced at
 * save time; anything the parser accepts is guaranteed to terminate in bounded time.
 *
 * The variable set is deliberately small (documented in `WARN_CHECK_VARIABLES`):
 *
 *   - total          number  — the bill's total amount in its own currency
 *   - currency       string  — ISO 4217 code, or empty string
 *   - supplierKnown bool  — true iff a Supplier row exists for this workspace and the
 *                            extracted vendor resolves to it. Newcomers are `false`. Gate 4
 *                            (supplier-trust, ticket #54) will introduce a stricter
 *                            `verifiedAt` signal on Supplier when it lands; this variable's
 *                            underlying check tightens then, no DSL change needed.
 *   - category       string  — the coded category (empty when uncoded)
 *   - description    string  — the concatenated line-item descriptions
 *   - vatRate        number  — the extracted VAT rate as a decimal (0.15 for 15%)
 *   - daysToDue      number  — days from evaluation-time to the bill's due date (negative if
 *                              overdue, `null` if no due date)
 *
 * The operators cover the shapes AP reviewers actually author: equality, ordering,
 * substring on text, boolean composition. Anything more exotic (regex, arithmetic, string
 * concat) is deliberately absent — a rule that needs it belongs in code, not a workspace
 * setting.
 *
 * A predicate that references a variable outside the set fails to parse. That is the whole
 * safety story: no reflection, no dynamic property lookup, no way to walk from a variable
 * into the surrounding process. */

export type WarnCheckVariableType = "number" | "string" | "boolean"

/** The single source of truth for what a workspace author is allowed to write. Adding a
 * variable is a code change — deliberately: the runner needs to know how to fill each one from
 * the arrived document, and the admin UI needs to render it in the help text. */
export const WARN_CHECK_VARIABLES = {
  total: "number",
  currency: "string",
  supplierKnown: "boolean",
  category: "string",
  description: "string",
  vatRate: "number",
  daysToDue: "number",
} as const satisfies Record<string, WarnCheckVariableType>

export type WarnCheckVariableName = keyof typeof WARN_CHECK_VARIABLES

export type WarnCheckContext = {
  total: number | null
  currency: string | null
  supplierKnown: boolean
  category: string | null
  description: string | null
  vatRate: number | null
  daysToDue: number | null
}

/** Every operator in the language, in a shape the parser recognises. Kept as data (not a big
 * switch statement) so the docs / admin help text can render the set without re-listing it. */
export const WARN_CHECK_OPERATORS = ["==", "!=", "<=", ">=", "<", ">", "contains"] as const
export type WarnCheckOperator = (typeof WARN_CHECK_OPERATORS)[number]

// ---- AST ----------------------------------------------------------------------------------

type NumberLit = { kind: "number"; value: number }
type StringLit = { kind: "string"; value: string }
type BoolLit = { kind: "boolean"; value: boolean }
type NullLit = { kind: "null" }
type VarRef = { kind: "var"; name: keyof typeof WARN_CHECK_VARIABLES }
type Compare = { kind: "compare"; op: WarnCheckOperator; left: Expr; right: Expr }
type And = { kind: "and"; left: Expr; right: Expr }
type Or = { kind: "or"; left: Expr; right: Expr }
type Not = { kind: "not"; inner: Expr }

export type Expr = NumberLit | StringLit | BoolLit | NullLit | VarRef | Compare | And | Or | Not

// ---- Tokeniser ----------------------------------------------------------------------------

type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: WarnCheckOperator }
  | { kind: "lparen" }
  | { kind: "rparen" }

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/

function tokenize(source: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1
      continue
    }
    if (ch === "(") {
      out.push({ kind: "lparen" })
      i += 1
      continue
    }
    if (ch === ")") {
      out.push({ kind: "rparen" })
      i += 1
      continue
    }
    // Two-char operators first so `==` doesn't parse as two `=` tokens (there is no single `=`
    // — assignment isn't in the language, and using `=` alone would be a parse error).
    const two = source.slice(i, i + 2)
    if (two === "==" || two === "!=" || two === "<=" || two === ">=") {
      out.push({ kind: "op", value: two })
      i += 2
      continue
    }
    if (ch === "<" || ch === ">") {
      out.push({ kind: "op", value: ch as WarnCheckOperator })
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      const closer = ch
      let j = i + 1
      let value = ""
      while (j < source.length && source[j] !== closer) {
        // Backslash escapes for the closing quote and for backslash itself. Anything else is
        // taken verbatim — the DSL doesn't need \n / \t because rule messages are not
        // multi-line values here.
        if (source[j] === "\\" && j + 1 < source.length) {
          const next = source[j + 1]
          if (next === closer || next === "\\") {
            value += next
            j += 2
            continue
          }
        }
        value += source[j]
        j += 1
      }
      if (j >= source.length) throw new WarnCheckParseError(`Unterminated string literal at position ${i}`)
      out.push({ kind: "string", value })
      i = j + 1
      continue
    }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let j = i
      while (j < source.length && ((source[j] >= "0" && source[j] <= "9") || source[j] === ".")) {
        j += 1
      }
      const raw = source.slice(i, j)
      const num = Number(raw)
      if (!Number.isFinite(num)) throw new WarnCheckParseError(`Invalid number "${raw}" at position ${i}`)
      out.push({ kind: "number", value: num })
      i = j
      continue
    }
    const identMatch = source.slice(i).match(IDENT_RE)
    if (identMatch) {
      out.push({ kind: "ident", value: identMatch[0] })
      i += identMatch[0].length
      continue
    }
    throw new WarnCheckParseError(`Unexpected character "${ch}" at position ${i}`)
  }
  return out
}

export class WarnCheckParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WarnCheckParseError"
  }
}

// ---- Parser -------------------------------------------------------------------------------
//
// Precedence, lowest to highest: `or`, `and`, `not`, comparisons, primary.
// Left-associative; comparisons are non-chainable (`a < b < c` is a parse error) because it
// is ambiguous and workspace authors are more likely to have meant `(a < b) and (b < c)`.

type ParserState = { tokens: Token[]; pos: number }

function peek(state: ParserState): Token | undefined {
  return state.tokens[state.pos]
}

function consume(state: ParserState): Token {
  const t = state.tokens[state.pos]
  if (!t) throw new WarnCheckParseError("Unexpected end of expression")
  state.pos += 1
  return t
}

function parseExpr(state: ParserState): Expr {
  return parseOr(state)
}

function parseOr(state: ParserState): Expr {
  let left = parseAnd(state)
  while (true) {
    const t = peek(state)
    if (t && t.kind === "ident" && t.value === "or") {
      consume(state)
      const right = parseAnd(state)
      left = { kind: "or", left, right }
      continue
    }
    return left
  }
}

function parseAnd(state: ParserState): Expr {
  let left = parseNot(state)
  while (true) {
    const t = peek(state)
    if (t && t.kind === "ident" && t.value === "and") {
      consume(state)
      const right = parseNot(state)
      left = { kind: "and", left, right }
      continue
    }
    return left
  }
}

function parseNot(state: ParserState): Expr {
  const t = peek(state)
  if (t && t.kind === "ident" && t.value === "not") {
    consume(state)
    return { kind: "not", inner: parseNot(state) }
  }
  return parseComparison(state)
}

function parseComparison(state: ParserState): Expr {
  const left = parsePrimary(state)
  const t = peek(state)
  if (t && (t.kind === "op" || (t.kind === "ident" && t.value === "contains"))) {
    const op: WarnCheckOperator = t.kind === "op" ? t.value : "contains"
    consume(state)
    const right = parsePrimary(state)
    // Non-chainable: refuse `a < b < c` at parse time.
    const after = peek(state)
    if (after && (after.kind === "op" || (after.kind === "ident" && after.value === "contains"))) {
      throw new WarnCheckParseError(
        `Chained comparisons are not allowed — write "(x ${op} y) and (y ...)" explicitly`,
      )
    }
    return { kind: "compare", op, left, right }
  }
  return left
}

function parsePrimary(state: ParserState): Expr {
  const t = consume(state)
  if (t.kind === "lparen") {
    const inner = parseExpr(state)
    const close = consume(state)
    if (close.kind !== "rparen") throw new WarnCheckParseError('Missing closing ")"')
    return inner
  }
  if (t.kind === "number") return { kind: "number", value: t.value }
  if (t.kind === "string") return { kind: "string", value: t.value }
  if (t.kind === "ident") {
    if (t.value === "true") return { kind: "boolean", value: true }
    if (t.value === "false") return { kind: "boolean", value: false }
    if (t.value === "null") return { kind: "null" }
    // Reserved words that must never be re-interpreted as a bare variable — otherwise typing
    // `and` alone would be legal (it would parse as a var reference) and the error would show
    // up as an "unknown variable" instead of a syntax error.
    if (t.value === "and" || t.value === "or" || t.value === "not" || t.value === "contains") {
      throw new WarnCheckParseError(`Unexpected keyword "${t.value}"`)
    }
    if (!(t.value in WARN_CHECK_VARIABLES)) {
      throw new WarnCheckParseError(
        `Unknown variable "${t.value}". Allowed: ${Object.keys(WARN_CHECK_VARIABLES).join(", ")}`,
      )
    }
    return { kind: "var", name: t.value as keyof typeof WARN_CHECK_VARIABLES }
  }
  throw new WarnCheckParseError(`Unexpected token: ${JSON.stringify(t)}`)
}

/** Parse the source into an AST, throwing WarnCheckParseError with a human-readable message if
 * it is malformed or references an unknown variable. Callers surface the error to the author. */
export function parseWarnCheck(source: string): Expr {
  const trimmed = source.trim()
  if (trimmed.length === 0) throw new WarnCheckParseError("Expression is empty")
  const tokens = tokenize(trimmed)
  if (tokens.length === 0) throw new WarnCheckParseError("Expression is empty")
  const state: ParserState = { tokens, pos: 0 }
  const expr = parseExpr(state)
  if (state.pos !== tokens.length) {
    throw new WarnCheckParseError(`Unexpected trailing input at token ${state.pos}`)
  }
  return expr
}

// ---- Evaluator ----------------------------------------------------------------------------

export class WarnCheckEvalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WarnCheckEvalError"
  }
}

type Value = number | string | boolean | null

function readVariable(name: keyof typeof WARN_CHECK_VARIABLES, ctx: WarnCheckContext): Value {
  switch (name) {
    case "total": return ctx.total
    case "currency": return ctx.currency
    case "supplierKnown": return ctx.supplierKnown
    case "category": return ctx.category
    case "description": return ctx.description
    case "vatRate": return ctx.vatRate
    case "daysToDue": return ctx.daysToDue
    default: {
      // Belt-and-suspenders: parser only produces names in WARN_CHECK_VARIABLES, so this is
      // unreachable at runtime. TS still asks for a return statement on every switch arm.
      const _exhaustive: never = name
      throw new WarnCheckEvalError(`Unhandled variable: ${_exhaustive as string}`)
    }
  }
}

function evalExpr(node: Expr, ctx: WarnCheckContext): Value {
  switch (node.kind) {
    case "number": return node.value
    case "string": return node.value
    case "boolean": return node.value
    case "null": return null
    case "var": return readVariable(node.name, ctx)
    case "not": {
      const v = evalExpr(node.inner, ctx)
      // Only booleans participate in `not` — `not "hello"` is a rule bug and we surface it
      // rather than coercing (JS's truthiness would fold `not ""` to `true`, which is not what
      // an AP author expects).
      if (typeof v !== "boolean") throw new WarnCheckEvalError(`"not" expects a boolean; got ${typeof v}`)
      return !v
    }
    case "and": {
      const l = evalExpr(node.left, ctx)
      if (typeof l !== "boolean") throw new WarnCheckEvalError(`"and" left is not boolean; got ${typeof l}`)
      if (!l) return false
      const r = evalExpr(node.right, ctx)
      if (typeof r !== "boolean") throw new WarnCheckEvalError(`"and" right is not boolean; got ${typeof r}`)
      return r
    }
    case "or": {
      const l = evalExpr(node.left, ctx)
      if (typeof l !== "boolean") throw new WarnCheckEvalError(`"or" left is not boolean; got ${typeof l}`)
      if (l) return true
      const r = evalExpr(node.right, ctx)
      if (typeof r !== "boolean") throw new WarnCheckEvalError(`"or" right is not boolean; got ${typeof r}`)
      return r
    }
    case "compare": {
      const l = evalExpr(node.left, ctx)
      const r = evalExpr(node.right, ctx)
      return evalCompare(node.op, l, r)
    }
  }
}

function evalCompare(op: WarnCheckOperator, l: Value, r: Value): boolean {
  // Nulls always compare false — a rule referencing `total > 5000` on a bill with no total
  // should NOT fire (we don't know the total). This mirrors SQL's three-valued logic collapsed
  // to two-valued: unknown is treated as "condition not met" so a rule can't accidentally block
  // every bill that happens to be missing one field.
  if (l === null || r === null) return false

  if (op === "contains") {
    if (typeof l !== "string" || typeof r !== "string") {
      throw new WarnCheckEvalError('"contains" requires two strings')
    }
    return l.toLowerCase().includes(r.toLowerCase())
  }

  if (op === "==") return sameShape(l, r) && l === r
  if (op === "!=") return !sameShape(l, r) || l !== r

  // Ordering only on numbers. Comparing strings/booleans with < is a rule bug; refuse rather
  // than fall back to JS coercion (which lets `"10" < "9"` evaluate to true — the string sort).
  if (typeof l !== "number" || typeof r !== "number") {
    throw new WarnCheckEvalError(`Operator "${op}" requires two numbers`)
  }
  if (op === "<") return l < r
  if (op === "<=") return l <= r
  if (op === ">") return l > r
  if (op === ">=") return l >= r
  return false
}

function sameShape(l: Value, r: Value): boolean {
  return typeof l === typeof r
}

/** Evaluate a parsed predicate against a context. Returns true iff the rule fires. Any type
 * error at evaluation time throws WarnCheckEvalError — the runner catches it and treats the
 * rule as a silent pass rather than firing; that policy is in warn-checks.ts. */
export function evaluateWarnCheck(expr: Expr, ctx: WarnCheckContext): boolean {
  const result = evalExpr(expr, ctx)
  if (typeof result !== "boolean") {
    throw new WarnCheckEvalError(
      `Expression must evaluate to a boolean; got ${result === null ? "null" : typeof result}`,
    )
  }
  return result
}

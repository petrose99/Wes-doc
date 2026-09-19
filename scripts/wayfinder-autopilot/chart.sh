#!/usr/bin/env bash
# Chart a new Wayfinder map unattended: one headless `claude -p "/wayfinder <idea>"`
# session under the autopilot's config (WAYFINDER_CONFIG, default the Anthropic
# ladder; run-mistral-chart via `WAYFINDER_CONFIG=.claude/wayfinder-autopilot/config.mistral.sh`).
# The session charts only — the map issue, its first tickets, the fog — and
# resolves nothing; then work it with run.sh / run-mistral.sh <map>.
#
#   scripts/wayfinder-autopilot/chart.sh "<idea>" [--detach]
#
# Logs land in docs/wayfinder-reports/charting/.
set -euo pipefail
AP="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
IDEA="${1:?usage: chart.sh \"<idea>\" [--detach]}"; shift
DETACH=0; [ "${1:-}" = "--detach" ] && DETACH=1
OUT="$ROOT/docs/wayfinder-reports/charting"; mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [ "$DETACH" = 1 ]; then
  DOUT="$OUT/detached-$STAMP.out"
  nohup setsid "$0" "$IDEA" > "$DOUT" 2>&1 < /dev/null &
  ln -sfn "$(basename "$DOUT")" "$OUT/detached.out"
  echo "detached as pid $! — tail -f $DOUT"; exit 0
fi
export TZ="${TZ:-Africa/Johannesburg}"
# shellcheck source=/dev/null
source "${WAYFINDER_CONFIG:-$ROOT/.claude/wayfinder-autopilot/config.sh}"
MODEL="${WAYFINDER_MODEL:-$MODEL_STRONG}"
ALLOWED_TOOLS=(
  "Bash(gh:*)" "Bash(git:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(grep:*)" "Bash(rg:*)"
  "Bash(find:*)" "Bash(sed:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(wc:*)" "Bash(mkdir:*)"
  "Bash(date:*)" "Bash(echo:*)" "Bash(printf:*)"
  "Read" "Write" "Glob" "Grep" "Skill" "Agent" "WebFetch" "WebSearch"
)
BRIEF="$OUT/brief-$STAMP.md"
cat > "$BRIEF" <<'B'
## Autopilot: charting session

You are charting a new Wayfinder map unattended. You have the tools you
need: `Bash` (with `gh` and `git`), `Read`, `Write`, `Glob`, `Grep`, `Skill`,
`Agent`. Never answer that you lack tools — every step below is done with
one of them. Nobody answers questions:
AskUserQuestion is disabled, and a turn that ends without a tool call ends
the session. Follow the wayfinder skill's `reference/charting.md` in full:
create the map issue (label `wayfinder:map`), its first decision tickets as
child issues wired with native blocking, fog under **Not yet specified**,
**Out of scope** — and resolve nothing. Where charting would ask the human,
take the ➡️ recommendation and record it in the map's **Notes**.

Read `CONTEXT.md`, `CLAUDE.md` and `docs/agents/design-tickets.md` by range,
then the marketing site (`app/(marketing)`, `components/marketing`) through a
foreground `Explore` agent — not file by file. The map's **Notes** must name
the skills every session consults: the Intent skills and Impeccable
sub-commands per CLAUDE.md, and the Headcount department skills
`marketing:positioning-and-messaging`, `marketing:marketing-copywriting`,
`product:ux-product-auditor`, `product:product-requirements` (installed
plugins) — which one at which ticket type. Notes also carry the standing
autopilot delegation: sessions answer their own grilling with the ➡️
recommendation, never remove a feature, never AskUserQuestion.

**Tool mechanics (hard rules — the first attempt looped on these):**
- Never put a multi-line string inside a Bash command. Every issue body
  goes through the `Write` tool to `docs/wayfinder-reports/charting/<slug>.md`,
  then `gh issue create --title "..." --body-file <that path> --label ...`.
  Same for comments (`--body-file`) and edits.
- A Bash command is one short line. If a tool call returns
  `InputValidationError`, the input was too long or badly escaped: switch to
  the Write + `--body-file` route instead of retrying the same call.
- No `$( … )`, backticks, pipes into loops or `;`-chained multi-step Bash:
  the permission layer refuses any command containing an expansion
  (`Contains simple_expansion`) and the refusal comes back as the tool
  result. Fetch a value in one call, paste it literally in the next.
- Read every tool result before the next call. A refusal or an error means
  the step did **not** happen; redo it the allowed way instead of moving on.
- Wiring (from `docs/agents/issue-tracker.md`, repo `petrose99/Wes-doc`):
  child id → `gh api repos/petrose99/Wes-doc/issues/<n> --jq .id`;
  sub-issue → `gh api -X POST repos/petrose99/Wes-doc/issues/<map>/sub_issues -F sub_issue_id=<id>`;
  blocking → `gh api -X POST repos/petrose99/Wes-doc/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker id>`.
  Leave tickets unassigned — an assignee means *claimed*, off the frontier.
- Tickets are decisions about *this* surface, answerable in one session from
  the code and the named skills — not generic programme work (CRM, A/B
  frameworks, market analysis). Fog and tickets never overlap: a line is in
  **Not yet specified** or it is a ticket, not both.
- Read before you create: `CONTEXT.md`, the tracker doc
  (`docs/agents/issue-tracker.md`), the existing `wayfinder:map` issues
  (`gh issue list --label wayfinder:map`) so the new map's **Out of scope**
  and **Notes** relate to them rather than duplicate them, and the
  marketing site via one `Explore` agent — all of this before the first
  `gh issue create`.

End with one tool call that prints the map number and URL on a single line
`map: #<n> <url>`, then stop.
B
LOG="$OUT/chart-$STAMP.jsonl"
echo "charting on $MODEL — log $LOG"
# The session is kept resumable: a weaker model sometimes ends a turn with a
# canned "I don't have the tools" text instead of a tool call, which ends a
# -p session. If the transcript has no `map: #<n>` line yet, resume it with a
# nudge, up to NUDGES times, before giving up.
NUDGES="${WAYFINDER_CHART_NUDGES:-3}"; SID=""; PROMPT="/wayfinder $IDEA"; n=0
# WAYFINDER_CHART_RESUME=<session id>: pick an earlier charting session back up,
# opening with WAYFINDER_CHART_RESUME_PROMPT (default: the generic nudge) instead
# of a fresh /wayfinder call.
if [ -n "${WAYFINDER_CHART_RESUME:-}" ]; then
  SID="$WAYFINDER_CHART_RESUME"; PROMPT="${WAYFINDER_CHART_RESUME_PROMPT:-You stopped without finishing the charting. Continue per the brief and end with the single line 'map: #<n> <url>'.}"
  echo "resuming session $SID"
fi
while :; do
  ( cd "$ROOT" && claude -p "$PROMPT" \
      --append-system-prompt-file "$BRIEF" \
      ${SID:+--resume "$SID"} \
      ${MODEL:+--model "$MODEL"} \
      ${EFFORT:+--effort "$EFFORT"} \
      --permission-mode acceptEdits \
      --allowedTools "${ALLOWED_TOOLS[@]}" \
      --disallowedTools AskUserQuestion \
      --strict-mcp-config \
      --setting-sources project,local \
      --output-format stream-json --verbose \
      >> "$LOG" 2>>"$LOG.stderr" ) || echo "session exited non-zero (see $LOG.stderr)"
  read -r SID LAST < <(python3 - "$LOG" <<'PY'
import json,sys
last="";sid=""
for line in open(sys.argv[1]):
    try: d=json.loads(line)
    except: continue
    sid=d.get("session_id") or sid
    if d.get("type")=="assistant":
        for c in d["message"].get("content",[]):
            if c.get("type")=="text" and c["text"].strip(): last=c["text"].strip()
print(sid, last.replace("\n"," ")[-400:])
PY
)
  echo "--- session $SID ended: $LAST"
  if grep -q 'map: #[0-9]' <<<"$LAST"; then break; fi
  n=$((n+1)); [ "$n" -gt "$NUDGES" ] && { echo "gave up after $NUDGES nudges"; break; }
  echo "--- nudge $n"
  PROMPT="You stopped without finishing the charting. You do have the tools (Bash with gh, Read, Write, Glob, Grep, Skill, Agent). Continue from where you were: create or complete the map issue and its tickets exactly as the charting brief says (issue bodies via Write then gh --body-file), and end with the single line 'map: #<n> <url>'."
done

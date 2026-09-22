import type { ReactNode } from "react"

/** #208: the settings-toggle primitive every admin checkbox in Settings/Automation is required to
 * go through. `explanation` isn't optional — a toggle whose consequence isn't spelled out in one
 * sentence is exactly the failure mode #187/#208 are closing off (an admin flips a switch with no
 * idea what it actually does until something breaks). Generalizes the checkbox-plus-blurb markup
 * `components/settings/automation-config-form.tsx` already used for "The policy check has to
 * pass" / "Any warning stops it, not just a failure" onto one component so a new toggle can't
 * skip the explanation by copy-pasting a bare `<input type="checkbox">`.
 *
 * `variant="block"` (default) is the stacked label-then-explanation form used in a Panel's
 * divide-y list. `variant="inline"` is for a toggle that has to fit in a dense row (e.g. an
 * amount band's "Trusted suppliers only") — the explanation still renders, as a title tooltip and
 * a screen-reader-only sentence, so cramped layout is never a reason to drop it. */
export function SettingToggle({ id, label, explanation, checked, onChange, disabled, variant = "block" }: {
  id: string
  label: ReactNode
  /** One sentence: what changes, or what the workspace is trading off, when this is on. */
  explanation: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  variant?: "block" | "inline"
}) {
  // #231 Q22 (#252): the inline variant's explanation is visible too — a sentence under the
  // label in the same 12px the block variant uses — never only in `title`, which a keyboard or
  // touch user never sees.
  if (variant === "inline") {
    return (
      <label htmlFor={id} className="flex items-start gap-2 pb-2.5 text-[13px] text-slate-700">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-emerald-700"
        />
        <span>
          <span className="block">{label}</span>
          <span className="block text-xs text-slate-500">{explanation}</span>
        </span>
      </label>
    )
  }

  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-3 first:pt-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-emerald-700"
      />
      <span>
        <span className="block text-sm text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{explanation}</span>
      </span>
    </label>
  )
}

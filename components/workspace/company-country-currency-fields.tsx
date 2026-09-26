"use client"

import { COMPANY_COUNTRIES, allowedCurrencies, defaultCurrency } from "@/lib/geo/company-currency"

/** #457 spec §5.1: the Country + Company currency pair both creation forms use (the new-company
 * form and Admin › Companies' Add a company). Only Lesotho and South Africa; a Lesotho company
 * picks LSL or ZAR, a South African one is ZAR — shown as text with a hidden input, never a
 * disabled select (that would drop out of FormData). Changing the country resets the currency to
 * the country's own. Each form keeps its own label/select classes. */
export function CompanyCountryCurrencyFields({ idPrefix, country, currency, onChange, labelClassName, selectClassName }: {
  idPrefix: string
  country: string
  currency: string
  onChange: (value: { country: string; currency: string }) => void
  labelClassName: string
  selectClassName: string
}) {
  const options = allowedCurrencies(country)
  const hintId = `${idPrefix}-currency-hint`
  const hint = options.length > 1
    ? "LSL and ZAR are pegged 1:1. You can change it until the first bill is posted."
    : "Companies in South Africa use ZAR."
  return <div className="grid grid-cols-2 gap-3">
    <div className="space-y-1">
      <label htmlFor={`${idPrefix}-country`} className={labelClassName}>Country</label>
      <select id={`${idPrefix}-country`} name="country" value={country} className={selectClassName}
        onChange={(event) => onChange({ country: event.target.value, currency: defaultCurrency(event.target.value) ?? "" })}>
        {COMPANY_COUNTRIES.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select>
    </div>
    <div className="space-y-1">
      {options.length > 1
        ? <>
            <label htmlFor={`${idPrefix}-currency`} className={labelClassName}>Company currency</label>
            <select id={`${idPrefix}-currency`} name="baseCurrency" value={currency} aria-describedby={hintId} className={selectClassName}
              onChange={(event) => onChange({ country, currency: event.target.value })}>
              {options.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </>
        : <>
            <span className={labelClassName}>Company currency</span>
            <p className="flex h-9 items-center text-sm font-medium text-slate-900">{options[0]}</p>
            <input type="hidden" name="baseCurrency" value={options[0] ?? ""} />
          </>}
    </div>
    <p id={hintId} className="col-span-2 -mt-1 text-xs leading-relaxed text-slate-600">{hint}</p>
  </div>
}

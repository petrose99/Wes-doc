# Populated security registers

Authoritative copies of the registers listed in the [POLICY-SET](../POLICY-SET.md). The empty
templates that used to live in `../templates/` are the field definitions; the files here are
the *filled* versions used for evidence.

Ownership is one person per row (see [roles-raci.md](../roles-raci.md)); `<TBD-*>`
placeholders match the RACI so a single find-and-replace names everything at once.

## Files

- `risk-register.csv` — risks with likelihood × impact score, treatment, and evidence link.
- `asset-inventory.csv` — Terraform-managed AWS resources plus SaaS accounts.
- `supplier-register.csv` — every third party with access to DocuBite data, with DPA status.
- `data-inventory.csv` — one row per data class (retention, storage, encryption, deletion).
- `access-review.csv` — seed row for the first quarterly review.

## Refresh cadence

| File | Cadence | Trigger |
|---|---|---|
| risk-register.csv | Quarterly | Any new incident / material system change |
| asset-inventory.csv | Quarterly | Any new Terraform resource or SaaS onboarding |
| supplier-register.csv | Semi-annual | New vendor / DPA change / breach notice from a supplier |
| data-inventory.csv | Annual | Any new data class or storage location |
| access-review.csv | Quarterly | Every role change or offboarding |

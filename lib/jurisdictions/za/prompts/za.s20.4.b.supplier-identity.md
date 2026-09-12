# za.s20.4.b.supplier-identity

Supplier name, address and VAT registration number are required — VAT Act s20(4)(b); SARS
tax-invoices page: <https://www.sars.gov.za/businesses-and-employers/government/tax-invoices/>.

The VAT number is 10 digits starting with 4 (`^4\d{9}$`). A missing or mis-shaped VAT
number invalidates the invoice; the supplier must reissue.

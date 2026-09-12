# za.s16.2.a.valid-invoice-held

Input VAT may not be deducted unless the vendor holds a valid tax invoice — VAT Act s16(2)(a);
SARS: <https://www.sars.gov.za/businesses-and-employers/government/tax-invoices/>.

The AP control must therefore block the input-tax claim until s20 validity passes; a late fix
by the supplier may still be claimed within the 5-year s16(3) proviso window.

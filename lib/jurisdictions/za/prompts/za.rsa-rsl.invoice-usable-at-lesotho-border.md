# za.rsa-rsl.invoice-usable-at-lesotho-border

Under the SARS–Revenue Services Lesotho common-border arrangement, a valid ZA tax invoice
from a 10-digit `^4\d{9}$` VAT vendor that is at most 90 days old settles Lesotho import VAT
at the border. Source: SARS customs agreements —
<https://www.sars.gov.za/customs-and-excise/customs-agreements/lesotho/>.

The rule row fires only when the origin is ZA and the destination is LS; it does not change
ZA's own VAT201 treatment (the supply remains standard-rated on the ZA side).

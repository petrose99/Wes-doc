#!/usr/bin/env python3
"""Generate the sample invoice corpus under samples/invoices/.

These PDFs exist to drive the real ingestion path end to end — upload or email-in, extraction,
coding, then the gates from #40/#41 and the ZA/LS workpaper columns from #69/#70/#85. They are
deliberately *content*-driven rather than fixture rows: a seeded row proves the maths, a PDF
proves extraction feeds the maths the fields it expects.

Every case is declared once in CASES below and carries the assertion it is meant to trigger, so
`samples/invoices/README.md` is generated from the same source as the files and can't drift.

Run:  python scripts/make-sample-invoices.py
Deps: reportlab (already present on the dev box; `pip install reportlab` otherwise)
"""

from __future__ import annotations

import datetime as dt
import os
import textwrap
from dataclasses import dataclass, field

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "samples", "invoices")

# Anchor date. Period under test is October 2026, so the ZA/LS VAT period end is 2026-10-31 and
# the aging buckets below are measured back from it.
PERIOD_END = dt.date(2026, 10, 31)


def days_before(n: int) -> dt.date:
    return PERIOD_END - dt.timedelta(days=n)


@dataclass
class Line:
    description: str
    quantity: str
    unit_price: float
    amount: float


@dataclass
class Case:
    """One sample invoice. `expect` is the behaviour a tester should see; it lands in the README."""

    slug: str
    jurisdiction: str  # "ZA" | "LS"
    expect: str
    supplier_name: str
    supplier_address: str
    supplier_country: str
    invoice_no: str
    issue_date: dt.date
    lines: list[Line]
    tax_rate: float  # percent
    currency: str = "ZAR"
    supplier_vat_no: str | None = None
    recipient_name: str | None = "Thabo Trading (Pty) Ltd"
    recipient_address: str | None = "14 Loop Street, Cape Town, 8001, South Africa"
    recipient_vat_no: str | None = "4012345678"
    heading: str = "TAX INVOICE"
    show_vat_separately: bool = True
    show_quantity: bool = True
    zero_rated_note: str | None = None
    notes: list[str] = field(default_factory=list)
    degrade: bool = False  # render as a poor scan to push extraction confidence down
    po_reference: str | None = None

    @property
    def net(self) -> float:
        return round(sum(line.amount for line in self.lines), 2)

    @property
    def vat(self) -> float:
        return round(self.net * self.tax_rate / 100.0, 2)

    @property
    def gross(self) -> float:
        return round(self.net + self.vat, 2)


# --------------------------------------------------------------------------------------------
# ZA cases
# --------------------------------------------------------------------------------------------

ZA_CASES = [
    # ---- VAT201 buckets (#69): isImport x isCapital, plus the zero-rated leg -----------------
    Case(
        slug="za-domestic-other-standard",
        jurisdiction="ZA",
        expect="Passes every s20 check. Lands in VAT201 input_domestic_other (net + vat), box 15.",
        supplier_name="Karoo Office Supplies CC",
        supplier_address="221 Voortrekker Road, Bellville, 7530, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4180229311",
        invoice_no="KOS-2026-4471",
        issue_date=days_before(12),
        lines=[Line("A4 copier paper, 80gsm, box of 5 reams", "24", 289.00, 6936.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-domestic-capital",
        jurisdiction="ZA",
        expect="Code the category as capital. Lands in VAT201 input_domestic_capital, box 14.",
        supplier_name="Highveld Server Systems (Pty) Ltd",
        supplier_address="8 Empire Road, Parktown, Johannesburg, 2193, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4550118872",
        invoice_no="HSS-8841",
        issue_date=days_before(20),
        lines=[Line("Rack server, 2U, 128GB RAM — capital equipment", "1", 84500.00, 84500.00)],
        tax_rate=15.0,
        notes=["Asset register ref: SRV-2026-011. Capitalised, 5-year straight line."],
    ),
    Case(
        slug="za-imported-other",
        jurisdiction="ZA",
        expect="Supplier country is GB, so isImport derives true. Lands in input_imported_other, box 15A.",
        supplier_name="Thames Analytics Ltd",
        supplier_address="70 Gracechurch Street, London, EC3V 0HR, United Kingdom",
        supplier_country="GB",
        supplier_vat_no="4993001220",
        invoice_no="TA-INV-20261",
        issue_date=days_before(18),
        lines=[Line("Imported market data subscription, Q4 2026", "1", 12400.00, 12400.00)],
        tax_rate=15.0,
        notes=["Import VAT accounted for on entry. SARS customs code CCA 4471820."],
    ),
    Case(
        slug="za-imported-capital",
        jurisdiction="ZA",
        expect="Import + capital. Lands in input_imported_capital, box 14A.",
        supplier_name="Bavaria Präzision GmbH",
        supplier_address="Industriestraße 12, 80939 München, Germany",
        supplier_country="DE",
        supplier_vat_no="4771902336",
        invoice_no="BP-2026-0774",
        issue_date=days_before(29),
        lines=[Line("CNC lathe, model BP-450 — capital plant", "1", 318000.00, 318000.00)],
        tax_rate=15.0,
        notes=["Asset register ref: PLT-2026-003. Import entry SAD500 ref 447102993."],
    ),
    Case(
        slug="za-zero-rated-export",
        jurisdiction="ZA",
        expect="0% line. Contributes net with vat = 0 (not null) to the zero-rated column. "
        "Also exercises the s11 carveout that lets a zero-rated invoice be in foreign currency.",
        supplier_name="Cape Reach Exports (Pty) Ltd",
        supplier_address="3 Dock Road, V&A Waterfront, Cape Town, 8002, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4330887190",
        invoice_no="CRE-2026-118",
        issue_date=days_before(9),
        lines=[Line("Dried rooibos, 500kg — direct export", "500", 44.00, 22000.00)],
        tax_rate=0.0,
        zero_rated_note="Zero-rated direct export under VAT Act s11(1)(a). VAT charged at 0%.",
    ),
    # ---- s20 invoice-validity failures (#36 / gate 2) ----------------------------------------
    Case(
        slug="za-invalid-no-vat-number",
        jurisdiction="ZA",
        expect="HARD BLOCK. Fails za.s20.4.b.supplier-identity — no supplier VAT registration number.",
        supplier_name="Grayline Consulting",
        supplier_address="19 Church Street, Pretoria, 0002, South Africa",
        supplier_country="ZA",
        supplier_vat_no=None,
        invoice_no="GC-0931",
        issue_date=days_before(7),
        lines=[Line("Advisory services, September 2026", "1", 18500.00, 18500.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-invalid-bad-vat-format",
        jurisdiction="ZA",
        expect="HARD BLOCK. VAT number 1180229311 fails /^4\\d{9}$/ — must be 10 digits starting with 4.",
        supplier_name="Midrand Logistics CC",
        supplier_address="45 New Road, Midrand, 1685, South Africa",
        supplier_country="ZA",
        supplier_vat_no="1180229311",
        invoice_no="ML-7720",
        issue_date=days_before(5),
        lines=[Line("Palletised delivery, 12 drops", "12", 640.00, 7680.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-invalid-no-quantity",
        jurisdiction="ZA",
        expect="HARD BLOCK at full-invoice level (>R5,000). Fails za.s20.4.e.description-and-quantity "
        "— description present, quantity/volume absent.",
        supplier_name="Sandton Interiors (Pty) Ltd",
        supplier_address="122 Rivonia Road, Sandton, 2196, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4660771244",
        invoice_no="SI-2026-55",
        issue_date=days_before(15),
        lines=[Line("Office refurbishment works as quoted", "", 46000.00, 46000.00)],
        tax_rate=15.0,
        show_quantity=False,
    ),
    Case(
        slug="za-invalid-foreign-currency",
        jurisdiction="ZA",
        expect="HARD BLOCK. USD on a standard-rated ZA invoice fails za.s20.4.currency-zar "
        "(the foreign-currency carveout applies only to zero-rated supplies).",
        supplier_name="Northwind Software Inc",
        supplier_address="500 Howard Street, San Francisco, CA 94105, United States",
        supplier_country="US",
        supplier_vat_no="4880112004",
        invoice_no="NW-99120",
        issue_date=days_before(11),
        lines=[Line("Platform licence, annual", "1", 4200.00, 4200.00)],
        tax_rate=15.0,
        currency="USD",
    ),
    # ---- s20 threshold legs -------------------------------------------------------------------
    Case(
        slug="za-abridged-valid",
        jurisdiction="ZA",
        expect="PASSES. R2,300 sits between R50 and R5,000, so the abridged s20(5) rule set applies "
        "— recipient details and quantity are not required and their absence must NOT gate it.",
        supplier_name="Bo-Kaap Coffee Roasters",
        supplier_address="71 Wale Street, Cape Town, 8001, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4210559083",
        invoice_no="BKC-3312",
        issue_date=days_before(4),
        lines=[Line("Office coffee supply, October", "", 2000.00, 2000.00)],
        tax_rate=15.0,
        recipient_name=None,
        recipient_address=None,
        recipient_vat_no=None,
        show_quantity=False,
    ),
    Case(
        slug="za-under-r50-receipt",
        jurisdiction="ZA",
        expect="PASSES with NO rules applied. R43.70 is under the s20(6) R50 threshold, so the "
        "jurisdiction-validity gate must yield an empty rule set rather than fail on missing fields.",
        supplier_name="Shell Ultra City Colesberg",
        supplier_address="N1 Highway, Colesberg, 9795, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4020117733",
        invoice_no="R-88213",
        issue_date=days_before(3),
        lines=[Line("Refreshments", "", 38.00, 38.00)],
        tax_rate=15.0,
        heading="RECEIPT",
        recipient_name=None,
        recipient_address=None,
        recipient_vat_no=None,
        show_quantity=False,
    ),
    # ---- gates (#40 / #41) --------------------------------------------------------------------
    Case(
        slug="za-duplicate-of-kos-4471",
        jurisdiction="ZA",
        expect="HARD BLOCK on the duplicate gate — same supplier AND same invoice number as "
        "za-domestic-other-standard. Upload that one FIRST, then this one.",
        supplier_name="Karoo Office Supplies CC",
        supplier_address="221 Voortrekker Road, Bellville, 7530, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4180229311",
        invoice_no="KOS-2026-4471",
        issue_date=days_before(12),
        lines=[Line("A4 copier paper, 80gsm, box of 5 reams", "24", 289.00, 6936.00)],
        tax_rate=15.0,
        notes=["Duplicate copy — same serial number, re-sent by the supplier."],
    ),
    Case(
        slug="za-duplicate-near-miss",
        jurisdiction="ZA",
        expect="HARD BLOCK on the duplicate gate via the second limb — different invoice number, "
        "but same supplier, same total and a date within +/-3 days of za-domestic-capital.",
        supplier_name="Highveld Server Systems (Pty) Ltd",
        supplier_address="8 Empire Road, Parktown, Johannesburg, 2193, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4550118872",
        invoice_no="HSS-8841-R",
        issue_date=days_before(18),
        lines=[Line("Rack server, 2U, 128GB RAM — capital equipment", "1", 84500.00, 84500.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-unverified-supplier-over-threshold",
        jurisdiction="ZA",
        expect="SOFT GATE (supplier trust). Supplier has no Supplier row, and R9,200 is over the "
        "default R500 threshold. Verifying the supplier must resolve the gate.",
        supplier_name="Umhlanga Facilities Management (Pty) Ltd",
        supplier_address="4 Lagoon Drive, Umhlanga Rocks, 4319, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4770330918",
        invoice_no="UFM-2026-201",
        issue_date=days_before(6),
        lines=[Line("Monthly cleaning contract, October 2026", "1", 8000.00, 8000.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-smb-ceiling-breach",
        jurisdiction="ZA",
        expect="HARD BLOCK on gate 7 (smb_ceiling) while the workspace has no reviewer — gross "
        "R14,375 is over the R10,000 SMB ceiling. Adding a reviewer (firm mode) must clear it.",
        supplier_name="Drakensberg Plant Hire",
        supplier_address="12 Industrial Crescent, Pietermaritzburg, 3201, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4441220087",
        invoice_no="DPH-4402",
        issue_date=days_before(8),
        lines=[Line("Excavator hire, 5 days", "5", 2500.00, 12500.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-po-variance-over-tolerance",
        jurisdiction="ZA",
        expect="SOFT GATE (match variance) once matched to PO-2026-0910 for R40,000 — this bills "
        "R43,400, an 8.5% variance against the default 2% tolerance. Pair with za-purchase-order.",
        supplier_name="Vaal Steel Supplies (Pty) Ltd",
        supplier_address="9 Furnace Road, Vanderbijlpark, 1911, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4120998321",
        invoice_no="VSS-6621",
        issue_date=days_before(14),
        lines=[Line("Mild steel sheet, 3mm, 2440x1220", "62", 700.00, 43400.00)],
        tax_rate=15.0,
        po_reference="PO-2026-0910",
        notes=["Quantity delivered exceeded the order by 2 sheets; price per sheet unchanged."],
    ),
    Case(
        slug="za-low-quality-scan",
        jurisdiction="ZA",
        expect="SOFT GATE (confidence band) expected. Rendered as a skewed, faded scan so field "
        "confidence falls below the 0.92 minimum for the R500-R5,000 band. Confidence is "
        "model-dependent, so treat this as a probe rather than a deterministic assertion.",
        supplier_name="Zwelitsha Hardware",
        supplier_address="Shop 4, Mdantsane Road, Zwelitsha, 5608, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4090221755",
        invoice_no="ZH-1182",
        issue_date=days_before(10),
        lines=[Line("Assorted fixings and fasteners", "1", 2600.00, 2600.00)],
        tax_rate=15.0,
        degrade=True,
    ),
    # ---- AP aging buckets (#96) ---------------------------------------------------------------
    Case(
        slug="za-aging-current",
        jurisdiction="ZA",
        expect="AP aging: Current bucket (invoice dated on the period end).",
        supplier_name="Tygerberg Print Studio",
        supplier_address="6 Durban Road, Bellville, 7530, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4310442091",
        invoice_no="TPS-5001",
        issue_date=days_before(0),
        lines=[Line("Brochure print run", "500", 12.00, 6000.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-aging-1-30",
        jurisdiction="ZA",
        expect="AP aging: 1-30 day bucket (21 days before period end).",
        supplier_name="Tygerberg Print Studio",
        supplier_address="6 Durban Road, Bellville, 7530, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4310442091",
        invoice_no="TPS-4902",
        issue_date=days_before(21),
        lines=[Line("Business card reprint", "1000", 3.20, 3200.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-aging-31-60",
        jurisdiction="ZA",
        expect="AP aging: 31-60 day bucket (47 days before period end).",
        supplier_name="Tygerberg Print Studio",
        supplier_address="6 Durban Road, Bellville, 7530, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4310442091",
        invoice_no="TPS-4755",
        issue_date=days_before(47),
        lines=[Line("Exhibition banners", "6", 890.00, 5340.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-aging-61-90",
        jurisdiction="ZA",
        expect="AP aging: 61-90 day bucket (78 days before period end).",
        supplier_name="Tygerberg Print Studio",
        supplier_address="6 Durban Road, Bellville, 7530, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4310442091",
        invoice_no="TPS-4610",
        issue_date=days_before(78),
        lines=[Line("Annual report print, 120pp", "250", 74.00, 18500.00)],
        tax_rate=15.0,
    ),
    Case(
        slug="za-aging-90-plus",
        jurisdiction="ZA",
        expect="AP aging: 90+ day bucket (134 days before period end). Also the oldest unposted "
        "bill, so it should appear in the accrual draft with Dr <category> / Dr VAT suspense.",
        supplier_name="Tygerberg Print Studio",
        supplier_address="6 Durban Road, Bellville, 7530, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4310442091",
        invoice_no="TPS-4188",
        issue_date=days_before(134),
        lines=[Line("Signage installation", "1", 9400.00, 9400.00)],
        tax_rate=15.0,
    ),
]

# --------------------------------------------------------------------------------------------
# LS cases — upload these into a workspace whose jurisdiction is Lesotho (LS)
# --------------------------------------------------------------------------------------------

LS_RECIPIENT = ("Maluti Supplies (Pty) Ltd", "12 Kingsway, Maseru 100, Lesotho", "M0114220")

LS_CASES = [
    Case(
        slug="ls-domestic-standard-15",
        jurisdiction="LS",
        expect="VAT-12 domestic standard-rate line at 15%.",
        supplier_name="Berea Stationers (Pty) Ltd",
        supplier_address="24 Pioneer Road, Maseru 100, Lesotho",
        supplier_country="LS",
        supplier_vat_no="M0229118",
        invoice_no="BS-2026-330",
        issue_date=days_before(13),
        lines=[Line("Office consumables, October", "1", 4200.00, 4200.00)],
        tax_rate=15.0,
        currency="LSL",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
    ),
    Case(
        slug="ls-electricity-10",
        jurisdiction="LS",
        expect="LS charges electricity at 10%, not 15% — must land in its own VAT-12 rate line.",
        supplier_name="Lesotho Electricity Company",
        supplier_address="Old Police Ground, Mabile Road, Maseru 100, Lesotho",
        supplier_country="LS",
        supplier_vat_no="M0100011",
        invoice_no="LEC-2026-10-88431",
        issue_date=days_before(2),
        lines=[Line("Electricity supply, October 2026 — 4,180 kWh", "4180", 1.55, 6479.00)],
        tax_rate=10.0,
        currency="LSL",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
    ),
    Case(
        slug="ls-zero-rated",
        jurisdiction="LS",
        expect="0% line. Contributes net with vat = 0 to the LS zero-rated column.",
        supplier_name="Highlands Grain Co-operative",
        supplier_address="Main Road, Mohale's Hoek 800, Lesotho",
        supplier_country="LS",
        supplier_vat_no="M0447120",
        invoice_no="HGC-771",
        issue_date=days_before(16),
        lines=[Line("Maize meal, 80kg bags — zero-rated foodstuff", "150", 92.00, 13800.00)],
        tax_rate=0.0,
        currency="LSL",
        zero_rated_note="Zero-rated supply under the VAT Act 2001, Schedule II.",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
    ),
    Case(
        slug="ls-import-goods-15",
        jurisdiction="LS",
        expect="Import of GOODS at 15%. Drives the VAT-12 import line and, on the return-form "
        "workpaper, the goods leg of the goods/services split.",
        supplier_name="Gauteng Wholesale Traders (Pty) Ltd",
        supplier_address="18 Commissioner Street, Johannesburg, 2001, South Africa",
        supplier_country="ZA",
        supplier_vat_no="5220118844",
        invoice_no="GWT-20991",
        issue_date=days_before(22),
        lines=[Line("Imported dry goods, mixed pallet", "1", 31000.00, 31000.00)],
        tax_rate=15.0,
        currency="LSL",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
        notes=[
            "Supplier VAT number does NOT match the SARS 4-prefix format, so this must fall out "
            "of the RSA cross-border column even though the supplier is South African.",
        ],
    ),
    Case(
        slug="ls-import-services-15",
        jurisdiction="LS",
        expect="Import of SERVICES at 15%. Needs the category's nature set to 'service' (or a "
        "per-bill override) to reach the services leg of LS_VAT12_RETURN; with nature unset it "
        "must silent-pass the return-form columns rather than land in the goods leg.",
        supplier_name="Drakensberg Advisory Services",
        supplier_address="31 Church Street, Pietermaritzburg, 3201, South Africa",
        supplier_country="ZA",
        supplier_vat_no="5661229003",
        invoice_no="DAS-2026-44",
        issue_date=days_before(19),
        lines=[Line("Imported consultancy — systems review", "1", 27500.00, 27500.00)],
        tax_rate=15.0,
        currency="LSL",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
    ),
    Case(
        slug="ls-rsa-cross-border-valid",
        jurisdiction="LS",
        expect="MUST land in the RSA cross-border column: supplier country ZA, VAT number "
        "4471029338 matches /^4\\d{9}$/, and the invoice is 34 days before period end (within 90).",
        supplier_name="Free State Agri Supplies (Pty) Ltd",
        supplier_address="88 Nelson Mandela Drive, Bloemfontein, 9301, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4471029338",
        invoice_no="FSA-2026-8812",
        issue_date=days_before(34),
        lines=[Line("Fertiliser, 50kg bags", "200", 410.00, 82000.00)],
        tax_rate=15.0,
        currency="ZAR",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
        notes=["Valid RSA tax invoice presented at the border under the SARS-RSL arrangement."],
    ),
    Case(
        slug="ls-rsa-cross-border-expired",
        jurisdiction="LS",
        expect="MUST NOT land in the RSA cross-border column — supplier and VAT number qualify, "
        "but the invoice is 118 days before period end, past the 90-day window.",
        supplier_name="Free State Agri Supplies (Pty) Ltd",
        supplier_address="88 Nelson Mandela Drive, Bloemfontein, 9301, South Africa",
        supplier_country="ZA",
        supplier_vat_no="4471029338",
        invoice_no="FSA-2026-8104",
        issue_date=days_before(118),
        lines=[Line("Fertiliser, 50kg bags", "120", 410.00, 49200.00)],
        tax_rate=15.0,
        currency="ZAR",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
    ),
    Case(
        slug="ls-rsa-cross-border-bad-vat-no",
        jurisdiction="LS",
        expect="MUST NOT land in the RSA cross-border column — ZA supplier, inside the 90-day "
        "window, but VAT number 5471029338 does not start with 4.",
        supplier_name="Northern Cape Feeds CC",
        supplier_address="17 Bultfontein Road, Kimberley, 8301, South Africa",
        supplier_country="ZA",
        supplier_vat_no="5471029338",
        invoice_no="NCF-3390",
        issue_date=days_before(25),
        lines=[Line("Livestock feed, bulk", "1", 38000.00, 38000.00)],
        tax_rate=15.0,
        currency="ZAR",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
    ),
    Case(
        slug="ls-invalid-no-vat-number",
        jurisdiction="LS",
        expect="HARD BLOCK. Fails ls.s24.8.b.supplier-identity — no supplier VAT registration number.",
        supplier_name="Qacha's Nek General Dealers",
        supplier_address="Main Street, Qacha's Nek 600, Lesotho",
        supplier_country="LS",
        supplier_vat_no=None,
        invoice_no="QNG-118",
        issue_date=days_before(17),
        lines=[Line("General provisions", "1", 7400.00, 7400.00)],
        tax_rate=15.0,
        currency="LSL",
        recipient_name=LS_RECIPIENT[0],
        recipient_address=LS_RECIPIENT[1],
        recipient_vat_no=LS_RECIPIENT[2],
    ),
]

CASES = ZA_CASES + LS_CASES


# --------------------------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------------------------

SYMBOL = {"ZAR": "R", "LSL": "M", "USD": "$", "GBP": "£", "EUR": "€"}


def money(currency: str, amount: float) -> str:
    return f"{SYMBOL.get(currency, currency + ' ')}{amount:,.2f}"


def render(case: Case, path: str) -> None:
    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4
    c.setTitle(f"{case.heading} {case.invoice_no}")
    c.setAuthor(case.supplier_name)
    c.setSubject("DocuBite sample invoice — test fixture")

    if case.degrade:
        # A faded, slightly rotated render standing in for a bad phone scan.
        c.setFillColorRGB(0.97, 0.96, 0.93)
        c.rect(0, 0, width, height, stroke=0, fill=1)
        c.translate(14 * mm, -10 * mm)
        c.rotate(-2.4)
        ink = colors.Color(0.42, 0.42, 0.45)
    else:
        ink = colors.black

    c.setFillColor(ink)
    c.setStrokeColor(ink)

    y = height - 28 * mm

    # Supplier block
    c.setFont("Helvetica-Bold", 15)
    c.drawString(20 * mm, y, case.supplier_name)
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    for chunk in textwrap.wrap(case.supplier_address, 60):
        c.drawString(20 * mm, y, chunk)
        y -= 4.4 * mm
    if case.supplier_vat_no:
        c.drawString(20 * mm, y, f"VAT registration no: {case.supplier_vat_no}")
        y -= 4.4 * mm

    # Heading
    c.setFont("Helvetica-Bold", 20)
    c.drawRightString(width - 20 * mm, height - 28 * mm, case.heading)
    c.setFont("Helvetica", 10)
    c.drawRightString(width - 20 * mm, height - 36 * mm, f"Invoice no: {case.invoice_no}")
    c.drawRightString(width - 20 * mm, height - 41 * mm, f"Date of issue: {case.issue_date.isoformat()}")
    if case.po_reference:
        c.drawRightString(width - 20 * mm, height - 46 * mm, f"Your order: {case.po_reference}")

    y -= 6 * mm
    c.line(20 * mm, y, width - 20 * mm, y)
    y -= 8 * mm

    # Recipient block
    if case.recipient_name:
        c.setFont("Helvetica-Bold", 9)
        c.drawString(20 * mm, y, "Billed to")
        y -= 5 * mm
        c.setFont("Helvetica", 9)
        c.drawString(20 * mm, y, case.recipient_name)
        y -= 4.4 * mm
        if case.recipient_address:
            for chunk in textwrap.wrap(case.recipient_address, 60):
                c.drawString(20 * mm, y, chunk)
                y -= 4.4 * mm
        if case.recipient_vat_no:
            c.drawString(20 * mm, y, f"VAT registration no: {case.recipient_vat_no}")
            y -= 4.4 * mm
        y -= 4 * mm

    # Line table
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Description")
    if case.show_quantity:
        c.drawRightString(128 * mm, y, "Qty")
    c.drawRightString(158 * mm, y, "Unit price")
    c.drawRightString(width - 20 * mm, y, "Amount")
    y -= 2.5 * mm
    c.line(20 * mm, y, width - 20 * mm, y)
    y -= 6 * mm

    c.setFont("Helvetica", 9)
    for line in case.lines:
        for i, chunk in enumerate(textwrap.wrap(line.description, 52)):
            c.drawString(20 * mm, y - i * 4.4 * mm, chunk)
        if case.show_quantity and line.quantity:
            c.drawRightString(128 * mm, y, line.quantity)
        c.drawRightString(158 * mm, y, money(case.currency, line.unit_price))
        c.drawRightString(width - 20 * mm, y, money(case.currency, line.amount))
        y -= max(1, len(textwrap.wrap(line.description, 52))) * 4.4 * mm + 3 * mm

    y -= 3 * mm
    c.line(112 * mm, y, width - 20 * mm, y)
    y -= 6 * mm

    # Totals
    if case.show_vat_separately:
        c.drawRightString(158 * mm, y, "Subtotal (excl. VAT)")
        c.drawRightString(width - 20 * mm, y, money(case.currency, case.net))
        y -= 5 * mm
        c.drawRightString(158 * mm, y, f"VAT @ {case.tax_rate:g}%")
        c.drawRightString(width - 20 * mm, y, money(case.currency, case.vat))
        y -= 5 * mm
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(158 * mm, y, "Total due")
        c.drawRightString(width - 20 * mm, y, money(case.currency, case.gross))
    else:
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(158 * mm, y, f"Total due (incl. VAT @ {case.tax_rate:g}%)")
        c.drawRightString(width - 20 * mm, y, money(case.currency, case.gross))
    y -= 10 * mm

    c.setFont("Helvetica", 8.5)
    if case.zero_rated_note:
        c.drawString(20 * mm, y, case.zero_rated_note)
        y -= 5 * mm
    for note in case.notes:
        for chunk in textwrap.wrap(note, 96):
            c.drawString(20 * mm, y, chunk)
            y -= 4.2 * mm

    # Provenance footer — keeps a generated document from being mistaken for a real one.
    c.setFont("Helvetica-Oblique", 7.5)
    c.setFillColor(colors.Color(0.55, 0.55, 0.58))
    c.drawString(20 * mm, 14 * mm, "DocuBite test fixture — generated sample, not a real invoice. Companies and figures are fictional.")
    c.drawRightString(width - 20 * mm, 14 * mm, case.slug)

    c.showPage()
    c.save()


def render_purchase_order(path: str) -> None:
    """The counterpart PO for za-po-variance-over-tolerance, so the match gate has something
    to match against. Ordered value is deliberately R40,000 against a R43,400 invoice."""
    c = canvas.Canvas(path, pagesize=A4)
    width, height = A4
    c.setTitle("PURCHASE ORDER PO-2026-0910")
    y = height - 28 * mm
    c.setFont("Helvetica-Bold", 15)
    c.drawString(20 * mm, y, "Thabo Trading (Pty) Ltd")
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, "14 Loop Street, Cape Town, 8001, South Africa")
    c.setFont("Helvetica-Bold", 20)
    c.drawRightString(width - 20 * mm, height - 28 * mm, "PURCHASE ORDER")
    c.setFont("Helvetica", 10)
    c.drawRightString(width - 20 * mm, height - 36 * mm, "Order no: PO-2026-0910")
    c.drawRightString(width - 20 * mm, height - 41 * mm, f"Date: {days_before(24).isoformat()}")
    y -= 12 * mm
    c.line(20 * mm, y, width - 20 * mm, y)
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Supplier")
    y -= 5 * mm
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, "Vaal Steel Supplies (Pty) Ltd")
    y -= 4.4 * mm
    c.drawString(20 * mm, y, "9 Furnace Road, Vanderbijlpark, 1911, South Africa")
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "Description")
    c.drawRightString(128 * mm, y, "Qty")
    c.drawRightString(158 * mm, y, "Unit price")
    c.drawRightString(width - 20 * mm, y, "Amount")
    y -= 2.5 * mm
    c.line(20 * mm, y, width - 20 * mm, y)
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y, "Mild steel sheet, 3mm, 2440x1220")
    c.drawRightString(128 * mm, y, "60")
    c.drawRightString(158 * mm, y, "R700.00")
    c.drawRightString(width - 20 * mm, y, "R40,000.00")
    y -= 10 * mm
    c.line(112 * mm, y, width - 20 * mm, y)
    y -= 6 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(158 * mm, y, "Order total (excl. VAT)")
    c.drawRightString(width - 20 * mm, y, "R40,000.00")
    c.setFont("Helvetica-Oblique", 7.5)
    c.setFillColor(colors.Color(0.55, 0.55, 0.58))
    c.drawString(20 * mm, 14 * mm, "DocuBite test fixture — generated sample, not a real purchase order.")
    c.drawRightString(width - 20 * mm, 14 * mm, "za-purchase-order")
    c.showPage()
    c.save()


def write_readme() -> None:
    lines = [
        "# Sample invoices",
        "",
        "Generated by `scripts/make-sample-invoices.py` — **do not edit by hand**, edit the",
        "`CASES` list in that script and re-run it so this index stays in step with the files.",
        "",
        "Every file is a fictional invoice built to drive one branch of the ingestion path:",
        "extraction, coding, the gates from #40/#41, and the ZA/LS workpaper columns from",
        "#69/#70/#85. Upload them through the finance inbox (or email them in) rather than",
        "seeding rows, so extraction is exercised too.",
        "",
        "## How to use",
        "",
        "1. Set the workspace jurisdiction first (`Settings -> Jurisdiction`), or AP inbound is",
        "   refused outright — the ZA files need a **ZA** workspace, the LS files an **LS** one.",
        "2. The period these are built around is **October 2026** (period end `2026-10-31`);",
        "   the aging buckets and the LS 90-day cross-border window are measured back from it.",
        "3. Upload `za-domestic-other-standard.pdf` **before** `za-duplicate-of-kos-4471.pdf`,",
        "   and `za-domestic-capital.pdf` before `za-duplicate-near-miss.pdf` — the duplicate",
        "   gate needs the original to already be there.",
        "4. `za-purchase-order.pdf` must be in before `za-po-variance-over-tolerance.pdf` for",
        "   the match-variance gate to have something to match against.",
        "",
        "## Caveats",
        "",
        "- **Extraction is not deterministic.** These assert what the *rules* should do given",
        "  correctly extracted fields. If a case misbehaves, check the extracted values before",
        "  concluding the rule is wrong.",
        "- `za-low-quality-scan.pdf` probes the confidence-band gate, which depends on model",
        "  confidence scores. It is a probe, not a guaranteed trigger.",
        "- `ls-import-services-15.pdf` only reaches the services leg of `LS_VAT12_RETURN` once",
        "  the category's nature is set to `service` (`Settings -> Categories`) or a per-bill",
        "  override is applied. Unset nature must silent-pass, which is itself worth checking.",
        "",
    ]

    for juris, group, blurb in (
        ("ZA", ZA_CASES, "Upload into a workspace set to **South Africa (ZA)**."),
        ("LS", LS_CASES, "Upload into a workspace set to **Lesotho (LS)**."),
    ):
        lines += [f"## {juris} cases", "", blurb, "", "| File | Total | What it should do |", "| --- | --- | --- |"]
        for case in group:
            total = money(case.currency, case.gross)
            expect = " ".join(case.expect.split())
            lines.append(f"| `{case.slug}.pdf` | {total} | {expect} |")
        lines.append("")

    lines += [
        "## Supporting documents",
        "",
        "| File | What it is |",
        "| --- | --- |",
        "| `za-purchase-order.pdf` | PO-2026-0910 for R40,000 — the counterpart that makes "
        "`za-po-variance-over-tolerance.pdf` an 8.5% variance against the 2% default tolerance. |",
        "",
    ]

    with open(os.path.join(OUT_DIR, "README.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for case in CASES:
        render(case, os.path.join(OUT_DIR, f"{case.slug}.pdf"))
    render_purchase_order(os.path.join(OUT_DIR, "za-purchase-order.pdf"))
    write_readme()
    print(f"Wrote {len(CASES) + 1} PDFs + README.md to {OUT_DIR}")


if __name__ == "__main__":
    main()

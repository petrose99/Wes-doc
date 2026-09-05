/** One-off generator for eval fixture PDFs. Run once to produce the synthetic test documents
 * in eval/fixtures/. These are deterministic, small PDFs with known ground-truth values that
 * exercise specific pipeline features (cross-page merging, other charges, multi-account
 * statements, running-balance chains).
 *
 * Usage: npx tsx scripts/make-eval-fixtures.ts
 *
 * Requires pdfkit: npm install --save-dev pdfkit */
import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

const fixtureDir = path.join(process.cwd(), "eval", "fixtures")
fs.mkdirSync(fixtureDir, { recursive: true })

function writeDoc(filename: string, build: (doc: InstanceType<typeof PDFDocument>) => void) {
  const doc = new PDFDocument({ size: "A4", margin: 50 })
  const stream = fs.createWriteStream(path.join(fixtureDir, filename))
  doc.pipe(stream)
  build(doc)
  doc.end()
  return new Promise<void>((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject) })
}

async function main() {
  await writeDoc("multi-page-invoice.pdf", (doc) => {
    doc.fontSize(18).text("INVOICE", { align: "center" })
    doc.moveDown()
    doc.fontSize(10)
    doc.text("Vendor: Acme Testing Corp")
    doc.text("Invoice Number: TEST-MPG-001")
    doc.text("Issue Date: 2025-03-15")
    doc.text("Currency: USD")
    doc.moveDown()

    doc.text("Line Items:")
    doc.moveDown(0.5)
    const items = [
      { description: "Widget Alpha", quantity: 10, unit_price: 25.00, amount: 250.00 },
      { description: "Widget Beta", quantity: 5, unit_price: 30.00, amount: 150.00 },
      { description: "Widget Gamma", quantity: 20, unit_price: 12.50, amount: 250.00 },
      { description: "Widget Delta", quantity: 8, unit_price: 45.00, amount: 360.00 },
      { description: "Widget Epsilon with extended", quantity: 3, unit_price: 100.00, amount: 300.00 },
    ]
    for (const item of items.slice(0, 4)) {
      doc.text(`  ${item.description}    Qty: ${item.quantity}    Unit: $${item.unit_price.toFixed(2)}    Amount: $${item.amount.toFixed(2)}`)
    }

    // Force page break mid-table
    doc.addPage()
    // Repeated header (should be dropped by P1)
    doc.fontSize(10).text("Description    Quantity    Unit Price    Amount")
    // Continuation of the last item's description wrapping onto page 2
    doc.text("  description that wraps across pages")
    // Last item
    doc.text(`  ${items[4].description}    Qty: ${items[4].quantity}    Unit: $${items[4].unit_price.toFixed(2)}    Amount: $${items[4].amount.toFixed(2)}`)

    doc.moveDown()
    // Other charges section
    doc.text("Other Charges:")
    doc.text("  Handling Fee    $15.00")
    doc.text("  Early Payment Discount    -$50.00")

    doc.moveDown()
    doc.text(`Subtotal: $1,310.00`)
    doc.text(`Tax (10%): $131.00`)
    doc.text(`Other Charges: -$35.00`)
    doc.text(`Total: $1,406.00`)
  })

  await writeDoc("multi-account-statement.pdf", (doc) => {
    doc.fontSize(18).text("BANK STATEMENT", { align: "center" })
    doc.moveDown()
    doc.fontSize(10)
    doc.text("Account Holder: Jane Test")
    doc.text("Statement Period: 2025-03-01 to 2025-03-31")
    doc.text("Currency: USD")
    doc.moveDown()

    // Account 1
    doc.fontSize(12).text("Account: 1234-5678")
    doc.fontSize(10)
    doc.text("Opening Balance: $5,000.00")
    doc.moveDown(0.5)
    doc.text("Date        Description              Debit     Credit    Balance")
    doc.text("03/01       Payroll Deposit                     2500.00   7500.00")
    doc.text("03/05       Office Rent              1200.00              6300.00")
    doc.text("03/10       Utility Payment           350.00              5950.00")
    doc.text("03/15       Client Payment                      1800.00   7750.00")
    doc.moveDown(0.5)
    doc.text("Closing Balance: $7,750.00")

    doc.moveDown()

    // Account 2
    doc.fontSize(12).text("Account: 8765-4321")
    doc.fontSize(10)
    doc.text("Opening Balance: $10,000.00")
    doc.moveDown(0.5)
    doc.text("Date        Description              Debit     Credit    Balance")
    doc.text("03/02       Transfer In                         5000.00   15000.00")
    // OCR-fragile amount: 3800 could be misread as 3080 (0↔8 confusion)
    doc.text("03/08       Equipment Purchase       3800.00              11200.00")
    doc.text("03/20       Service Revenue                     2200.00   13400.00")
    doc.moveDown(0.5)
    doc.text("Closing Balance: $13,400.00")
  })

  console.log("Fixtures written to eval/fixtures/")
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

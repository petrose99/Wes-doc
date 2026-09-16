p='prisma/schema.prisma'; s=open(p).read()

def rep(a,b):
    global s
    assert a in s, a[:60]
    s=s.replace(a,b,1)

rep('''  createdPaymentRuns PaymentRun[]        @relation("PaymentRunCreator")
''','''  createdPaymentRuns PaymentRun[]        @relation("PaymentRunCreator")
  submittedPaymentBatches PaymentRun[]   @relation("PaymentBatchSubmitter")
  approvedPaymentBatches  PaymentRun[]   @relation("PaymentBatchApprover")
  rejectedPaymentBatches  PaymentRun[]   @relation("PaymentBatchRejecter")
  exportedPaymentBatches  PaymentRun[]   @relation("PaymentBatchExporter")
  paidPaymentBatches      PaymentRun[]   @relation("PaymentBatchPayer")
  recordedInvoicePayments InvoicePayment[] @relation("InvoicePaymentRecorder")
  removedInvoicePayments  InvoicePayment[] @relation("InvoicePaymentRemover")
  billPayPreferences      BillPayPreference[] @relation("BillPayPreferenceEditor")
''')

rep('''  paymentRuns        PaymentRun[]
  paymentRunItems    PaymentRunItem[]
  suppliers          Supplier[]
''','''  paymentRuns        PaymentRun[]
  paymentRunItems    PaymentRunItem[]
  payerAccounts      PayerAccount[]
  invoicePayments    InvoicePayment[]
  billPayPreferences BillPayPreference[]
  suppliers          Supplier[]
''')

rep('''  paymentRunItems         PaymentRunItem[]
  bankMatchesAsStatement BankMatch[] @relation("BankMatchStatement")
''','''  paymentRunItems         PaymentRunItem[]
  invoicePayments         InvoicePayment[]
  billPayPreference       BillPayPreference?
  bankMatchesAsStatement BankMatch[] @relation("BankMatchStatement")
''')

rep('''  filename      String?
  sentAt        DateTime? @map("sent_at")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy     User?     @relation("PaymentRunCreator", fields: [createdById], references: [id], onDelete: SetNull)
  items         PaymentRunItem[]
''','''  filename      String?
  sentAt        DateTime? @map("sent_at")
  /// #229 / #251 (map #226): the user-facing *Payment batch*. Additive over the WP-AP2 run —
  /// `status` gains `pending_approval` | `approved` | `paid` | `rejected` beside the legacy
  /// `draft` / `sent`; the decision, export and paid facts each carry who and when. Downloading
  /// the file is a fact (`exportedAt`), never a state.
  name          String?
  comment       String?
  submittedById String?  @map("submitted_by_id") @db.Uuid
  approvedById  String?  @map("approved_by_id") @db.Uuid
  approvedAt    DateTime? @map("approved_at")
  rejectedById  String?  @map("rejected_by_id") @db.Uuid
  rejectedAt    DateTime? @map("rejected_at")
  rejectedReason String? @map("rejected_reason")
  exportedAt    DateTime? @map("exported_at")
  exportedById  String?  @map("exported_by_id") @db.Uuid
  paidAt        DateTime? @map("paid_at")
  paidById      String?  @map("paid_by_id") @db.Uuid
  payFromAccountId String? @map("pay_from_account_id") @db.Uuid
  currencyCode  String?  @map("currency_code")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy     User?     @relation("PaymentRunCreator", fields: [createdById], references: [id], onDelete: SetNull)
  submittedBy   User?     @relation("PaymentBatchSubmitter", fields: [submittedById], references: [id], onDelete: SetNull)
  approvedBy    User?     @relation("PaymentBatchApprover", fields: [approvedById], references: [id], onDelete: SetNull)
  rejectedBy    User?     @relation("PaymentBatchRejecter", fields: [rejectedById], references: [id], onDelete: SetNull)
  exportedBy    User?     @relation("PaymentBatchExporter", fields: [exportedById], references: [id], onDelete: SetNull)
  paidBy        User?     @relation("PaymentBatchPayer", fields: [paidById], references: [id], onDelete: SetNull)
  payFromAccount PayerAccount? @relation(fields: [payFromAccountId], references: [id], onDelete: SetNull)
  items         PaymentRunItem[]
  invoicePayments InvoicePayment[]
''')

rep('''  paymentTermsDays Int?   @map("payment_terms_days")
''','''  paymentTermsDays Int?   @map("payment_terms_days")
  /// #229 Q5 (#251): early-payment discount beside the net terms, rendered as "2/10 net 30" —
  /// `earlyPaymentDiscountPercent` off the bill total while today ≤ invoice date +
  /// `earlyPaymentDiscountDays`. Both null = no discount, no countdown, ever.
  earlyPaymentDiscountPercent Decimal? @map("early_payment_discount_percent") @db.Decimal(5, 2)
  earlyPaymentDiscountDays    Int?     @map("early_payment_discount_days")
''')

new_models='''
/// #229 Q4 (#251): a *Payer account* — the named workspace bank account a payment batch is paid
/// from. A label for the uploader ("which portal does this file belong to"); DocuBite never holds
/// credentials and the file never carries the number, only `lastFour`. One batch = one payer
/// account = one currency = one file.
model PayerAccount {
  id           String   @id @default(uuid()) @db.Uuid
  workspaceId  String   @map("workspace_id") @db.Uuid
  name         String
  bankName     String?  @map("bank_name")
  lastFour     String?  @map("last_four")
  currencyCode String   @map("currency_code")
  isDefault    Boolean  @default(false) @map("is_default")
  archivedAt   DateTime? @map("archived_at")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  batches      PaymentRun[]
  billPayPreferences BillPayPreference[]

  @@index([workspaceId, isDefault])
  @@map("payer_accounts")
}

/// #229 Q6 / ADR 0001 (#251): a *Payment record* — DocuBite's own fact that an amount was paid
/// against an invoice on a date, by a batch (`method: "batch"`) or by hand (`"manual"`, Mark as
/// paid). Never pushed to the ledger by this path. Removal is a soft delete with a reason so the
/// audit keeps the trail; `removedAt` rows are excluded from the derived paid state.
model InvoicePayment {
  id           String   @id @default(uuid()) @db.Uuid
  workspaceId  String   @map("workspace_id") @db.Uuid
  documentId   String   @map("document_id") @db.Uuid
  amount       Decimal  @db.Decimal(18, 2)
  currencyCode String   @map("currency_code")
  paidOn       DateTime @map("paid_on") @db.Date
  method       String
  batchId      String?  @map("batch_id") @db.Uuid
  reference    String?
  recordedById String?  @map("recorded_by_id") @db.Uuid
  removedAt    DateTime? @map("removed_at")
  removedById  String?  @map("removed_by_id") @db.Uuid
  removedReason String? @map("removed_reason")
  createdAt    DateTime @default(now()) @map("created_at")
  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  document     Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  batch        PaymentRun? @relation(fields: [batchId], references: [id], onDelete: SetNull)
  recordedBy   User?     @relation("InvoicePaymentRecorder", fields: [recordedById], references: [id], onDelete: SetNull)
  removedBy    User?     @relation("InvoicePaymentRemover", fields: [removedById], references: [id], onDelete: SetNull)

  @@index([workspaceId, documentId])
  @@index([workspaceId, batchId])
  @@map("invoice_payments")
}

/// #229 Q10 (#251): what the operator set on a Bill Pay row before batching it — the inline
/// *Amount to pay* (a partial payment, 0 < amount ≤ due) and the row's *Pay From*. One row per
/// invoice, upserted; a batch copies these at creation so later edits never rewrite a batch.
model BillPayPreference {
  documentId       String   @id @map("document_id") @db.Uuid
  workspaceId      String   @map("workspace_id") @db.Uuid
  amountToPay      Decimal? @map("amount_to_pay") @db.Decimal(18, 2)
  payFromAccountId String?  @map("pay_from_account_id") @db.Uuid
  updatedById      String?  @map("updated_by_id") @db.Uuid
  updatedAt        DateTime @updatedAt @map("updated_at")
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  document         Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  payFromAccount   PayerAccount? @relation(fields: [payFromAccountId], references: [id], onDelete: SetNull)
  updatedBy        User?     @relation("BillPayPreferenceEditor", fields: [updatedById], references: [id], onDelete: SetNull)

  @@index([workspaceId])
  @@map("bill_pay_preferences")
}
'''
rep('''  @@map("payment_run_items")
}
''','''  @@map("payment_run_items")
}
'''+new_models)
open(p,'w').write(s)
print("ok")

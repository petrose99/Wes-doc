// #252 helper: add WorkspaceFieldConfig to the Prisma schema and write its migration.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
const p = `${root}/prisma/schema.prisma`
let s = readFileSync(p, 'utf8')
if (!s.includes('WorkspaceFieldConfig')) {
  s = s.replace('  billPayPreferences BillPayPreference[]\n', '  billPayPreferences BillPayPreference[]\n  fieldConfigs       WorkspaceFieldConfig[]\n')
  s += `
/// #231 Q11 (#252): one row of Admin › Configuration › Fields — how one field of one document
/// type behaves on the Detail pane (editable, required) and in that type's queue system views
/// (width, position). A field without a row takes the defaults the code already had
/// (editable, the template's own \`required\`, normal width, canonical order), so this table is
/// an overlay, never the source of the fields themselves — those stay \`lib/doc-types.ts\` plus
/// each type's \`DocumentTemplate\` custom fields.
model WorkspaceFieldConfig {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @map("workspace_id") @db.Uuid
  docType     String   @map("doc_type")
  fieldKey    String   @map("field_key")
  editable    Boolean  @default(true)
  required    Boolean  @default(false)
  /// "hidden" | "narrow" | "normal" | "wide" — the queue column's default width; hidden = not a default column.
  width       String   @default("normal")
  position    Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, docType, fieldKey])
  @@map("workspace_field_configs")
}
`
  writeFileSync(p, s)
}
const dir = `${root}/prisma/migrations/20260916040000_add_workspace_field_configs`
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/migration.sql`, `-- #231 / #252 (Wayfinder map #226): Admin › Configuration › Fields. Additive: one overlay table
-- keyed on (workspace, document type, field key); absent rows mean "as the code defaulted".
CREATE TABLE "workspace_field_configs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "width" TEXT NOT NULL DEFAULT 'normal',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_field_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_field_configs_workspace_id_doc_type_field_key_key" ON "workspace_field_configs"("workspace_id", "doc_type", "field_key");

ALTER TABLE "workspace_field_configs" ADD CONSTRAINT "workspace_field_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`)
console.log('schema + migration written')

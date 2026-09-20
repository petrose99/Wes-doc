import { copyFileSync, readdirSync, mkdirSync } from "fs"
import { join } from "path"

const src = "/home/ubuntu/Dev/Wes-doc/shots-r7"
const dst = "/home/ubuntu/Dev/Wes-doc/shots-r1"

mkdirSync(dst, { recursive: true })

const files = readdirSync(src)
for (const f of files) {
  const srcPath = join(src, f)
  const dstPath = join(dst, f)
  copyFileSync(srcPath, dstPath)
  console.log(`Copied ${f}`)
}

console.log(`Copied ${files.length} files`)

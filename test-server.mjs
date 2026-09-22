import { execFileSync } from "child_process"

try {
  console.log("Testing server...")
  const result = execFileSync("node", ["-e", "require('http').get('http://localhost:3000/', (r) => { console.log(r.statusCode); process.exit(r.statusCode === 404 || r.statusCode === 200 ? 0 : 1); })"], {
    timeout: 5000,
    stdio: "pipe"
  })
  console.log("Server test result:", result.toString())
} catch (e) {
  console.error("Server test failed:", e.message)
  process.exit(1)
}

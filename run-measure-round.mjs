import { spawn, spawnSync } from "child_process"
import { execFileSync } from "child_process"
import fs from "fs"

// Start dev server
console.log("Starting dev server...")
const devServer = spawn("npm", ["run", "dev"], {
  cwd: "/home/ubuntu/Dev/Wes-doc",
  stdio: "pipe",
  detached: false,
  timeout: 600000 // 10 minutes
})

let serverReady = false
let attempts = 0

// Wait for server
while (attempts < 40) {
  try {
    execFileSync("curl", ["-s", "-f", "http://localhost:3000"], { timeout: 1000 })
    serverReady = true
    console.log("Server ready!")
    break
  } catch {
    attempts++
    if (attempts % 10 === 0) console.log(`Waiting... (${attempts}s)`)
  }
}

if (!serverReady) {
  console.error("Server never started")
  devServer.kill("SIGKILL")
  process.exit(1)
}

console.log("\nSeeding database...")
try {
  execFileSync("npx", ["tsx", "--env-file", ".env", "scripts/seed-sample-docs.ts", "af91555d-7450-4b21-a8ac-73db092617c8"], {
    cwd: "/home/ubuntu/Dev/Wes-doc",
    stdio: "inherit",
    timeout: 30000
  })
} catch (e) {
  console.error("Seed failed:", e)
  devServer.kill("SIGKILL")
  process.exit(1)
}

console.log("\nRunning capture round...")
try {
  const outDir = "/home/ubuntu/Dev/Wes-doc/shots-r1"
  execFileSync("npx", [
    "--prefix", "/home/ubuntu/Dev/Wes-doc",
    "tsx",
    "--env-file", "/home/ubuntu/Dev/Wes-doc/.env",
    "docs/wayfinder-reports/226/logs/scratch-266/round266.mjs",
    outDir
  ], {
    stdio: "inherit",
    timeout: 900000 // 15 minutes for playwright
  })
  console.log("\nCapture complete!")
} catch (e) {
  console.error("Capture failed:", e.message)
  devServer.kill("SIGKILL")
  process.exit(1)
}

console.log("Shutting down...")
devServer.kill("SIGTERM")
process.exit(0)

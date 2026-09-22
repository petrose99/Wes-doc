import { spawn, spawnSync } from "child_process"
import { execSync } from "child_process"

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

console.log("Starting dev server...")
const devServer = spawn("npm", ["run", "dev"], {
  cwd: "/home/ubuntu/Dev/Wes-doc",
  stdio: "pipe"
})

// Wait for server to be ready (check port)
let serverReady = false
for (let i = 0; i < 30; i++) {
  try {
    execSync("curl -s http://localhost:3000 > /dev/null", { timeout: 2000 })
    serverReady = true
    console.log("Server is ready")
    break
  } catch {
    await sleep(1000)
    process.stdout.write(".")
  }
}

if (!serverReady) {
  console.error("Dev server failed to start")
  devServer.kill()
  process.exit(1)
}

console.log("\nSeeding database...")
try {
  execSync("npx tsx --env-file .env scripts/seed-sample-docs.ts af91555d-7450-4b21-a8ac-73db092617c8", {
    cwd: "/home/ubuntu/Dev/Wes-doc",
    stdio: "inherit"
  })
} catch (e) {
  console.error("Seed failed:", e.message)
  devServer.kill()
  process.exit(1)
}

console.log("\nRunning capture round as shots-r1...")
try {
  execSync("npx --prefix /home/ubuntu/Dev/Wes-doc tsx --env-file /home/ubuntu/Dev/Wes-doc/.env docs/wayfinder-reports/226/logs/scratch-266/round266.mjs /home/ubuntu/Dev/Wes-doc/shots-r1", {
    stdio: "inherit"
  })
} catch (e) {
  console.error("Capture round failed:", e.message)
  devServer.kill()
  process.exit(1)
}

console.log("\nCapture complete, shutting down server...")
devServer.kill()
process.exit(0)

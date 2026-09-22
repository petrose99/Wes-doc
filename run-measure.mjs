import { execFileSync, execSync } from "child_process"

const basePath = "/home/ubuntu/Dev/Wes-doc"
const scratchPath = `${basePath}/docs/wayfinder-reports/226/logs/scratch-266`
const shotsPath = `${basePath}/shots-r1`
const residueFile = `${scratchPath}/residue.txt`
const gateJson = `${scratchPath}/gate-r1.json`

console.log("Running gate check...")
try {
  const result = execFileSync("node", [`${basePath}/scripts/wayfinder-autopilot/gate.mjs`, shotsPath, "--baseline", `${basePath}/shots-r7`, "--residue-file", residueFile, "--json", gateJson], {
    stdio: "inherit",
    cwd: basePath
  })
  console.log("Gate check complete")
} catch (e) {
  if (e.status !== 0) {
    console.log(`Gate exited with code ${e.status} (may be expected for findings)`)
  }
}

console.log("\nCreating contact sheet...")
try {
  const result = execFileSync("node", [`${basePath}/scripts/wayfinder-autopilot/contact-sheet.mjs`, shotsPath, "--out", `${scratchPath}/contact-r1.png`], {
    stdio: "inherit",
    cwd: basePath
  })
  console.log("Contact sheet created")
} catch (e) {
  console.error("Contact sheet failed:", e.message)
}

console.log("Measure preparation complete")

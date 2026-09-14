/** Triggers a browser download of CSV text produced by a server action. Client-only — the CSV
 * arrives as a string over the server-action boundary, so this turns it into a file the same way
 * a plain `<a download>` on a route-handler response would, for actions that don't have a route. */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

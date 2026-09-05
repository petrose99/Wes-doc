const REDIRECT_PATH_RE = /^\/[A-Za-z0-9\-_\/]+$/

export function isValidRedirectPath(path: string): boolean {
  if (!path.startsWith("/")) return false
  if (path.includes("//")) return false
  return REDIRECT_PATH_RE.test(path)
}

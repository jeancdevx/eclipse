/**
 * Docker Compose interpolates `$VAR` / `${VAR}` in env files.
 * CurseForge keys look like `$2a$10$...` (bcrypt) and get mangled unless
 * each `$` is written as `$$` (compose turns that back into a single `$`).
 *
 * Note: `String#replaceAll('$', '$$')` is a no-op in JS — `$$` in the
 * replacement string means a single `$`. Use split/join instead.
 */
export function escapeComposeEnvValue(value: string): string {
  return value.split('$').join('$$')
}

/** Undo compose-style escaping if a value was stored with `$$`. */
export function unescapeComposeEnvValue(value: string): string {
  return value.split('$$').join('$')
}

export function formatComposeEnvFile(vars: Record<string, string>): string {
  return `${Object.entries(vars)
    .map(([k, v]) => `${k}=${escapeComposeEnvValue(v)}`)
    .join('\n')}\n`
}

import { describe, expect, it } from 'vitest'

import {
  escapeComposeEnvValue,
  formatComposeEnvFile,
  unescapeComposeEnvValue
} from './compose-env'

describe('compose-env', () => {
  it('doubles dollars for CurseForge-style keys (JS replaceAll $$ trap)', () => {
    const key = '$2a$10$k9hb7OsHtest/suffix'
    const escaped = escapeComposeEnvValue(key)
    expect(escaped).toBe('$$2a$$10$$k9hb7OsHtest/suffix')
    expect(escaped.startsWith('$$2a$$10$$')).toBe(true)
    expect(unescapeComposeEnvValue(escaped)).toBe(key)
  })

  it('formats env files with escaped values', () => {
    const body = formatComposeEnvFile({
      TYPE: 'AUTO_CURSEFORGE',
      CF_API_KEY: '$2a$10$abc'
    })
    expect(body).toContain('CF_API_KEY=$$2a$$10$$abc\n')
    expect(body).toContain('TYPE=AUTO_CURSEFORGE\n')
  })
})

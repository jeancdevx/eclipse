import { describe, expect, it } from 'vitest'

import {
  MEMORY_PRESET_MAP,
  createInstanceSchema,
  loaderVersionEnvKey
} from './schemas'

describe('schemas', () => {
  it('maps memory presets', () => {
    expect(MEMORY_PRESET_MAP.heavy).toBe('24G')
  })

  it('parses create instance', () => {
    const parsed = createInstanceSchema.parse({
      name: 'Lucky Blocks',
      slug: 'lucky-blocks'
    })
    expect(parsed.loader).toBe('FABRIC')
    expect(parsed.memoryPreset).toBe('light')
  })

  it('maps loader version env keys', () => {
    expect(loaderVersionEnvKey('NEOFORGE')).toBe('NEOFORGE_VERSION')
    expect(loaderVersionEnvKey('AUTO_CURSEFORGE')).toBe('NEOFORGE_VERSION')
    expect(loaderVersionEnvKey('FORGE')).toBe('FORGE_VERSION')
    expect(loaderVersionEnvKey('FABRIC')).toBe('FABRIC_LOADER_VERSION')
    expect(loaderVersionEnvKey('VANILLA')).toBeNull()
  })

  it('accepts optional loaderVersion pin', () => {
    const parsed = createInstanceSchema.parse({
      name: 'KEO',
      slug: 'keo',
      loader: 'NEOFORGE',
      mcVersion: '1.21.1',
      loaderVersion: '21.1.228'
    })
    expect(parsed.loaderVersion).toBe('21.1.228')
  })
})

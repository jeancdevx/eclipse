import { describe, expect, it } from 'vitest'

import { MEMORY_PRESET_MAP, createInstanceSchema } from './schemas'

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
})

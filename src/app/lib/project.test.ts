import { describe, expect, it } from 'vitest'
import { renameValues } from './project'

describe('renameValues', () => {
  it('moves stored values to their new keys and leaves the rest alone', () => {
    expect(renameValues({ TTL: '60', PORT: '3000' }, { TTL_SECONDS: 'TTL', NEW_KEY: 'MISSING' })).toEqual({
      PORT: '3000',
      TTL_SECONDS: '60',
    })
  })

  it('keeps empty values, which still count as set', () => {
    expect(renameValues({ A: '' }, { B: 'A' })).toEqual({ B: '' })
  })
})

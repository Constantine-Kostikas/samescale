import { describe, expect, it } from 'vitest'
import { decodeShare, encodeShare } from './share'
import type { ShareEntry } from './types'

const entries: ShareEntry[] = [
  { source: { kind: 'osm', osmType: 'R', osmId: 1371478 }, center: [4.9041, 52.3676] },
  { source: { kind: 'preset', presetId: 'manhattan' }, center: [-73.97123456, 40.78] },
  {
    source: { kind: 'drawn', outline: [[1, 2], [1.5, 2], [1.5, 2.5], [1, 2]] },
    center: [10, 20],
    name: 'My yard ✓',
  },
]

describe('share links', () => {
  it('round-trips every kind of shape', () => {
    const decoded = decodeShare(encodeShare(entries))
    expect(decoded).toHaveLength(3)
    expect(decoded[0]).toEqual(entries[0])
    expect(decoded[1]!.source).toEqual({ kind: 'preset', presetId: 'manhattan' })
    expect(decoded[1]!.center[0]).toBeCloseTo(-73.97123, 5)
    expect(decoded[2]!.name).toBe('My yard ✓')
    expect(decoded[2]!.source).toEqual(entries[2]!.source)
  })

  it('produces a URL-safe string', () => {
    expect(encodeShare(entries)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it.each(['', 'garbage!!', btoa('{"not":"an array"}'), btoa('[{"o":"X1","c":[0,0]}]'), btoa('[{"p":"a","c":["x",0]}]')])(
    'returns no shapes for a malformed hash %#',
    (hash) => {
      expect(decodeShare(hash)).toEqual([])
    },
  )

  it('skips only the invalid entries in an otherwise valid link', () => {
    const valid = encodeShare([entries[1]!])
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(valid.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
    json.push({ o: 'nope', c: [0, 0] })
    const mixed = btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeShare(mixed)).toHaveLength(1)
  })
})

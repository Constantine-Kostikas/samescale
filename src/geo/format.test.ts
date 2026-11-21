import { describe, expect, it } from 'vitest'
import { compareSizes, formatArea } from './format'

describe('formatArea', () => {
  it.each([
    [0.44, 'km2', '0.44 km²'],
    [38.2, 'km2', '38.2 km²'],
    [1589.4, 'km2', '1,589 km²'],
    [100, 'mi2', '38.6 mi²'],
  ] as const)('formats %s in %s as %s', (km2, unit, expected) => {
    expect(formatArea(km2, unit)).toBe(expected)
  })
})

describe('compareSizes', () => {
  it('puts the larger shape first with a ratio', () => {
    expect(compareSizes({ name: 'Athens', areaKm2: 38 }, { name: 'Greater London', areaKm2: 1589 })).toBe(
      'Greater London is 41.8 times the size of Athens.',
    )
  })

  it('uses whole numbers for big ratios', () => {
    expect(compareSizes({ name: 'Greenland', areaKm2: 2154808 }, { name: 'Athens', areaKm2: 38 })).toBe(
      'Greenland is 56,705 times the size of Athens.',
    )
  })

  it('reports nearly equal sizes as a percentage difference', () => {
    expect(compareSizes({ name: 'Lisbon', areaKm2: 87 }, { name: 'Manhattan', areaKm2: 87.4 })).toBe(
      'Manhattan is 0.5% larger than Lisbon.',
    )
  })
})

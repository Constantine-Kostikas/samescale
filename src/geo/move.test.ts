import { describe, expect, it } from 'vitest'
import area from '@turf/area'
import type { MultiPolygon, Polygon, Position } from 'geojson'
import { clampTarget, densify, dragTarget, moveGeometry, shapeCenter } from './move'

const athensLike: Polygon = {
  type: 'Polygon',
  coordinates: [[[23.68, 37.95], [23.79, 37.95], [23.79, 38.03], [23.68, 38.03], [23.68, 37.95]]],
}

const franceSized: Polygon = {
  type: 'Polygon',
  coordinates: [[[-4.5, 43], [7.5, 43], [7.5, 51], [-4.5, 51], [-4.5, 43]]],
}

const relativeAreaError = (a: Polygon | MultiPolygon, b: Polygon | MultiPolygon) =>
  Math.abs(area(a) - area(b)) / area(a)

describe('moveGeometry', () => {
  it.each([
    ['north to 60N', [10.75, 59.91]],
    ['to the equator', [-78.5, 0]],
    ['to the southern hemisphere', [151.2, -33.87]],
  ])('preserves the area of a city-sized shape moved %s', (_label, target) => {
    const from = shapeCenter(athensLike)
    const moved = moveGeometry(athensLike, from, target as Position)
    expect(relativeAreaError(athensLike, moved)).toBeLessThan(1e-4)
  })

  it('preserves the area of a country-sized densified shape moved to the equator', () => {
    const dense = densify(franceSized, 10)
    const moved = moveGeometry(dense, shapeCenter(dense), [20, 0])
    expect(relativeAreaError(dense, moved)).toBeLessThan(1e-4)
  })

  it('places the shape center at the requested target', () => {
    const moved = moveGeometry(athensLike, shapeCenter(athensLike), [4.9, 52.37])
    const center = shapeCenter(moved)
    expect(center[0]).toBeCloseTo(4.9, 2)
    expect(center[1]).toBeCloseTo(52.37, 2)
  })

  it('keeps north-up orientation: the northern edge stays north of the southern edge', () => {
    const moved = moveGeometry(athensLike, shapeCenter(athensLike), [-58.4, -34.6]) as Polygon
    const ring = moved.coordinates[0]!
    expect(ring[2]![1]).toBeGreaterThan(ring[1]![1])
    expect(ring[1]![0]).toBeGreaterThan(ring[0]![0])
  })

  it('keeps coordinates continuous across the antimeridian', () => {
    const moved = moveGeometry(athensLike, shapeCenter(athensLike), [179.99, 0]) as Polygon
    const lons = moved.coordinates[0]!.map((p) => p[0]!)
    expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(1)
  })

  it('moves every part of a MultiPolygon', () => {
    const multi = densify(
      {
        type: 'MultiPolygon',
        coordinates: [athensLike.coordinates, [[[23.9, 37.9], [24, 37.9], [24, 38], [23.9, 37.9]]]],
      },
      1,
    )
    const moved = moveGeometry(multi, shapeCenter(multi), [0, 0]) as MultiPolygon
    expect(moved.coordinates).toHaveLength(2)
    expect(relativeAreaError(multi, moved)).toBeLessThan(1e-4)
  })
})

describe('clampTarget', () => {
  it('keeps targets away from the poles', () => {
    expect(clampTarget([10, 89.9])[1]).toBe(85)
    expect(clampTarget([10, -90])[1]).toBe(-85)
  })

  it('wraps longitudes into [-180, 180]', () => {
    expect(clampTarget([190, 10])[0]).toBeCloseTo(-170)
  })
})

describe('densify', () => {
  it('splits long edges so no segment exceeds the limit', () => {
    const dense = densify(franceSized, 10) as Polygon
    expect(dense.coordinates[0]!.length).toBeGreaterThan(300)
  })

  it('leaves short edges untouched', () => {
    const dense = densify(athensLike, 50) as Polygon
    expect(dense.coordinates[0]).toHaveLength(5)
  })
})

describe('dragTarget', () => {
  it('moves the center by the same rotation that takes the grab point to the cursor', () => {
    const next = dragTarget([23.7, 38], [23.7, 38], [4.9, 52.37])
    expect(next[0]).toBeCloseTo(4.9, 6)
    expect(next[1]).toBeCloseTo(52.37, 6)
  })
})

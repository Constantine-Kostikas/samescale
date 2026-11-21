import centerOfMass from '@turf/center-of-mass'
import type { MultiPolygon, Polygon, Position } from 'geojson'

export type AreaGeometry = Polygon | MultiPolygon
type Vec3 = [number, number, number]

const RAD = Math.PI / 180
const EARTH_RADIUS_KM = 6371.0088
export const MAX_TARGET_LATITUDE = 85

const toVec = ([lon, lat]: Position): Vec3 => {
  const λ = lon! * RAD
  const φ = lat! * RAD
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)]
}

const toLonLat = ([x, y, z]: Vec3): Position => [
  Math.atan2(y, x) / RAD,
  Math.asin(Math.max(-1, Math.min(1, z))) / RAD,
]

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

interface LocalFrame {
  east: Vec3
  north: Vec3
  up: Vec3
}

const frameAt = ([lon, lat]: Position): LocalFrame => {
  const λ = lon! * RAD
  const φ = lat! * RAD
  return {
    east: [-Math.sin(λ), Math.cos(λ), 0],
    north: [-Math.sin(φ) * Math.cos(λ), -Math.sin(φ) * Math.sin(λ), Math.cos(φ)],
    up: [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)],
  }
}

/**
 * The rigid rotation of the sphere that carries `from` onto `to` while keeping
 * north pointing north. Every point keeps its distance and bearing relative to
 * the center, so areas are preserved exactly at any size.
 */
const northUpRotation = (from: Position, to: Position) => {
  const a = frameAt(from)
  const b = frameAt(to)
  return (p: Vec3): Vec3 => {
    const e = dot(p, a.east)
    const n = dot(p, a.north)
    const u = dot(p, a.up)
    return [
      e * b.east[0] + n * b.north[0] + u * b.up[0],
      e * b.east[1] + n * b.north[1] + u * b.up[1],
      e * b.east[2] + n * b.north[2] + u * b.up[2],
    ]
  }
}

const unwrapAround = (lon: number, referenceLon: number) => {
  let result = lon
  while (result - referenceLon > 180) result -= 360
  while (result - referenceLon < -180) result += 360
  return result
}

const mapRings = (geometry: AreaGeometry, fn: (ring: Position[]) => Position[]): AreaGeometry =>
  geometry.type === 'Polygon'
    ? { type: 'Polygon', coordinates: geometry.coordinates.map(fn) }
    : { type: 'MultiPolygon', coordinates: geometry.coordinates.map((polygon) => polygon.map(fn)) }

export const clampTarget = ([lon, lat]: Position): Position => [
  unwrapAround(lon!, 0),
  Math.max(-MAX_TARGET_LATITUDE, Math.min(MAX_TARGET_LATITUDE, lat!)),
]

export const shapeCenter = (geometry: AreaGeometry): Position => centerOfMass(geometry).geometry.coordinates

/**
 * Moves `geometry` so that the point `from` lands on `to`, preserving true size
 * and north-up orientation. Longitudes are unwrapped around the target so shapes
 * crossing the antimeridian render as one piece.
 */
export const moveGeometry = (geometry: AreaGeometry, from: Position, to: Position): AreaGeometry => {
  const target = clampTarget(to)
  const rotate = northUpRotation(from, target)
  return mapRings(geometry, (ring) =>
    ring.map((point) => {
      const [lon, lat] = toLonLat(rotate(toVec(point)))
      return [unwrapAround(lon!, target[0]!), lat!]
    }),
  )
}

/** Where a shape centered at `center` goes when the point grabbed at `grab` is dragged to `cursor`. */
export const dragTarget = (center: Position, grab: Position, cursor: Position): Position =>
  toLonLat(northUpRotation(grab, cursor)(toVec(center)))

const greatCircleKm = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * EARTH_RADIUS_KM

const slerp = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const ω = Math.acos(Math.max(-1, Math.min(1, dot(a, b))))
  const sinω = Math.sin(ω)
  const wa = Math.sin((1 - t) * ω) / sinω
  const wb = Math.sin(t * ω) / sinω
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]
}

/**
 * Inserts great-circle points so no edge is longer than `maxSegmentKm`.
 * MapLibre draws edges as straight lines in Mercator space, so long edges would
 * otherwise render at the wrong size after a move.
 */
export const densify = (geometry: AreaGeometry, maxSegmentKm: number): AreaGeometry =>
  mapRings(geometry, (ring) => {
    const result: Position[] = []
    ring.forEach((point, index) => {
      result.push(point)
      const next = ring[index + 1]
      if (!next) return
      const a = toVec(point)
      const b = toVec(next)
      const steps = Math.ceil(greatCircleKm(a, b) / maxSegmentKm)
      for (let step = 1; step < steps; step++) {
        const [lon, lat] = toLonLat(slerp(a, b, step / steps))
        result.push([unwrapAround(lon!, point[0]!), lat!])
      }
    })
    return result
  })

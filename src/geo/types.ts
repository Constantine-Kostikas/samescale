import type { Position } from 'geojson'
import type { AreaGeometry } from './move'

export type OsmType = 'N' | 'W' | 'R'

export type ShapeSource =
  | { kind: 'osm'; osmType: OsmType; osmId: number }
  | { kind: 'preset'; presetId: string }
  | { kind: 'drawn'; outline: Position[] }

export interface Shape {
  id: string
  name: string
  color: string
  source: ShapeSource
  /** Densified geometry at its real-world location. */
  base: AreaGeometry
  baseCenter: Position
  /** Where the shape's center currently sits on the map. */
  center: Position
  areaKm2: number
}

export interface ShareEntry {
  source: ShapeSource
  center: Position
  name?: string
}

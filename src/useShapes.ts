import area from '@turf/area'
import type { Position } from 'geojson'
import { computed, markRaw, ref } from 'vue'
import { clampTarget, densify, moveGeometry, shapeCenter, type AreaGeometry } from './geo/move'
import type { Shape, ShapeSource, ShareEntry } from './geo/types'

const DENSIFY_KM = 5
const PALETTE = ['#e4572e', '#2e86ab', '#e8a33d', '#3a9d5d', '#8e5cc2', '#d1495b', '#1b998b', '#7a5c44']

let nextId = 1

export interface NewShape {
  name: string
  source: ShapeSource
  geometry: AreaGeometry
  center?: Position
}

export const useShapes = () => {
  const shapes = ref<Shape[]>([])

  const nextColor = () => {
    const used = new Set(shapes.value.map((shape) => shape.color))
    return PALETTE.find((color) => !used.has(color)) ?? PALETTE[shapes.value.length % PALETTE.length]!
  }

  const add = ({ name, source, geometry, center }: NewShape): Shape => {
    const base = markRaw(densify(geometry, DENSIFY_KM))
    const baseCenter = shapeCenter(base)
    const shape: Shape = {
      id: `shape-${nextId++}`,
      name,
      color: nextColor(),
      source,
      base,
      baseCenter,
      center: center ? clampTarget(center) : baseCenter,
      areaKm2: area(base) / 1e6,
    }
    shapes.value.push(shape)
    return shape
  }

  const find = (id: string) => shapes.value.find((shape) => shape.id === id)

  const moveTo = (id: string, target: Position) => {
    const shape = find(id)
    if (shape) shape.center = clampTarget(target)
  }

  const resetPosition = (id: string) => {
    const shape = find(id)
    if (shape) shape.center = shape.baseCenter
  }

  const remove = (id: string) => {
    shapes.value = shapes.value.filter((shape) => shape.id !== id)
    movedCache.delete(id)
  }

  const isAway = (shape: Shape) =>
    Math.abs(shape.center[0]! - shape.baseCenter[0]!) > 1e-4 || Math.abs(shape.center[1]! - shape.baseCenter[1]!) > 1e-4

  const nearestTo = (id: string): Shape | undefined => {
    const shape = find(id)
    if (!shape) return undefined
    const [lon, lat] = shape.center
    const distance = (other: Shape) => {
      const dLat = (other.center[1]! - lat!) * (Math.PI / 180)
      const dLon = (other.center[0]! - lon!) * (Math.PI / 180)
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat! * (Math.PI / 180)) * Math.cos(other.center[1]! * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2
      return Math.asin(Math.min(1, Math.sqrt(a)))
    }
    return shapes.value
      .filter((other) => other.id !== id)
      .reduce<Shape | undefined>((best, other) => (!best || distance(other) < distance(best) ? other : best), undefined)
  }

  const movedCache = new Map<string, { key: string; geometry: AreaGeometry }>()

  const geometryOf = (shape: Shape): AreaGeometry => {
    const key = `${shape.center[0]},${shape.center[1]}`
    const cached = movedCache.get(shape.id)
    if (cached?.key === key) return cached.geometry
    const geometry = moveGeometry(shape.base, shape.baseCenter, shape.center)
    movedCache.set(shape.id, { key, geometry })
    return geometry
  }

  const shareEntries = computed<ShareEntry[]>(() =>
    shapes.value.map((shape) => ({
      source: shape.source,
      center: shape.center,
      name: shape.source.kind === 'drawn' ? shape.name : undefined,
    })),
  )

  return { shapes, add, find, moveTo, resetPosition, remove, isAway, nearestTo, geometryOf, shareEntries }
}

import type { AreaGeometry } from '../geo/move'

export interface Preset {
  id: string
  name: string
  geometry: AreaGeometry
}

let cache: Promise<Preset[]> | null = null

export const loadPresets = (): Promise<Preset[]> => {
  cache ??= import('./presets.json').then((module) => module.default as unknown as Preset[])
  return cache
}

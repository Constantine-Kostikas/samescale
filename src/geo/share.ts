import polyline from '@mapbox/polyline'
import type { Position } from 'geojson'
import type { OsmType, ShareEntry } from './types'

interface WireEntry {
  o?: string
  p?: string
  d?: string
  n?: string
  c: [number, number]
}

const DRAWN_PRECISION = 6

const round5 = (value: number) => Math.round(value * 1e5) / 1e5

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (encoded: string) => {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

const toWire = ({ source, center, name }: ShareEntry): WireEntry => {
  const c: [number, number] = [round5(center[0]!), round5(center[1]!)]
  switch (source.kind) {
    case 'osm':
      return { o: `${source.osmType}${source.osmId}`, c }
    case 'preset':
      return { p: source.presetId, c }
    case 'drawn':
      // polyline encodes [lat, lon]
      return { d: polyline.encode(source.outline.map(([lon, lat]) => [lat!, lon!]), DRAWN_PRECISION), n: name, c }
  }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const fromWire = (raw: unknown): ShareEntry | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const wire = raw as Partial<WireEntry>
  if (!Array.isArray(wire.c) || wire.c.length !== 2 || !wire.c.every(isFiniteNumber)) return null
  const center: Position = [wire.c[0], wire.c[1]]

  if (typeof wire.o === 'string') {
    const match = /^([NWR])(\d+)$/.exec(wire.o)
    if (!match) return null
    return { source: { kind: 'osm', osmType: match[1] as OsmType, osmId: Number(match[2]) }, center }
  }
  if (typeof wire.p === 'string' && wire.p.length > 0) {
    return { source: { kind: 'preset', presetId: wire.p }, center }
  }
  if (typeof wire.d === 'string') {
    const outline = polyline.decode(wire.d, DRAWN_PRECISION).map(([lat, lon]): Position => [lon, lat])
    if (outline.length < 4) return null
    return { source: { kind: 'drawn', outline }, center, name: typeof wire.n === 'string' ? wire.n : undefined }
  }
  return null
}

export const encodeShare = (entries: ShareEntry[]): string => toBase64Url(JSON.stringify(entries.map(toWire)))

export const decodeShare = (encoded: string): ShareEntry[] => {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(encoded))
    if (!Array.isArray(parsed)) return []
    return parsed.map(fromWire).filter((entry): entry is ShareEntry => entry !== null)
  } catch {
    return []
  }
}

<script setup lang="ts">
import type { Feature, FeatureCollection, Position } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent, MapLayerTouchEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { dragTarget, type AreaGeometry } from '../geo/move'
import type { Shape } from '../geo/types'

const props = defineProps<{
  shapes: Shape[]
  geometryOf: (shape: Shape) => AreaGeometry
  drawing: boolean
  draft: Position[]
}>()

const emit = defineEmits<{
  move: [id: string, center: Position]
  'draw-point': [point: Position]
  'draw-finish': []
}>()

maplibregl.setWorkerUrl(workerUrl)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const container = ref<HTMLDivElement>()
const ready = ref(false)
let map: maplibregl.Map | null = null

const emptyCollection = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] })

const shapeFeatures = (): FeatureCollection => ({
  type: 'FeatureCollection',
  features: props.shapes.map(
    (shape): Feature => ({
      type: 'Feature',
      id: shape.id,
      properties: { id: shape.id, color: shape.color },
      geometry: props.geometryOf(shape),
    }),
  ),
})

const northernmostPoint = (geometry: AreaGeometry): Position => {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
  return rings.flat().reduce((top, point) => (point[1]! > top[1]! ? point : top))
}

const labelFeatures = (): FeatureCollection => ({
  type: 'FeatureCollection',
  features: props.shapes.map(
    (shape): Feature => ({
      type: 'Feature',
      properties: { name: shape.name, color: shape.color },
      geometry: { type: 'Point', coordinates: northernmostPoint(props.geometryOf(shape)) },
    }),
  ),
})

const draftFeatures = (): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    ...props.draft.map((point): Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: point } })),
    ...(props.draft.length > 1
      ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: props.draft } } as Feature]
      : []),
  ],
})

const setData = (sourceId: string, data: FeatureCollection) => {
  ;(map?.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data)
}

const renderShapes = () => {
  setData('shapes', shapeFeatures())
  setData('labels', labelFeatures())
}

const addLayers = (target: maplibregl.Map) => {
  target.addSource('shapes', { type: 'geojson', data: emptyCollection() })
  target.addSource('labels', { type: 'geojson', data: emptyCollection() })
  target.addSource('draft', { type: 'geojson', data: emptyCollection() })

  target.addLayer({
    id: 'shapes-fill',
    type: 'fill',
    source: 'shapes',
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.38 },
  })
  target.addLayer({
    id: 'shapes-line',
    type: 'line',
    source: 'shapes',
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 },
  })
  target.addLayer({
    id: 'shapes-label',
    type: 'symbol',
    source: 'labels',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-anchor': 'bottom',
      'text-offset': [0, -0.4],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#1b2b3a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
  })
  target.addLayer({
    id: 'draft-line',
    type: 'line',
    source: 'draft',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#1b2b3a', 'line-width': 2, 'line-dasharray': [2, 1.5] },
  })
  target.addLayer({
    id: 'draft-points',
    type: 'circle',
    source: 'draft',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': '#1b2b3a', 'circle-stroke-width': 2 },
  })
}

interface DragState {
  id: string
  startCenter: Position
  grab: Position
}
let drag: DragState | null = null

const toPosition = (lngLat: maplibregl.LngLat): Position => [lngLat.lng, lngLat.lat]

const startDrag = (event: MapLayerMouseEvent | MapLayerTouchEvent) => {
  if (props.drawing) return
  const id = event.features?.[0]?.properties?.id as string | undefined
  const shape = props.shapes.find((candidate) => candidate.id === id)
  if (!shape) return
  event.preventDefault()
  drag = { id: shape.id, startCenter: shape.center, grab: toPosition(event.lngLat) }
  map!.getCanvas().style.cursor = 'grabbing'
  window.addEventListener('mouseup', endDrag)
  window.addEventListener('touchend', endDrag)
  window.addEventListener('touchcancel', endDrag)
}

const continueDrag = (event: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
  if (!drag) return
  emit('move', drag.id, dragTarget(drag.startCenter, drag.grab, toPosition(event.lngLat)))
}

const endDrag = () => {
  window.removeEventListener('mouseup', endDrag)
  window.removeEventListener('touchend', endDrag)
  window.removeEventListener('touchcancel', endDrag)
  if (!drag || !map) return
  drag = null
  map.getCanvas().style.cursor = ''
}

const registerInteractions = (target: maplibregl.Map) => {
  target.on('mousedown', 'shapes-fill', startDrag)
  target.on('touchstart', 'shapes-fill', (event) => {
    if (event.points.length === 1) startDrag(event)
  })
  target.on('mousemove', continueDrag)
  target.on('touchmove', continueDrag)
  target.on('mouseenter', 'shapes-fill', () => {
    if (!drag && !props.drawing) target.getCanvas().style.cursor = 'grab'
  })
  target.on('mouseleave', 'shapes-fill', () => {
    if (!drag && !props.drawing) target.getCanvas().style.cursor = ''
  })
  target.on('click', (event) => {
    if (props.drawing) emit('draw-point', toPosition(event.lngLat))
  })
  target.on('dblclick', (event) => {
    if (!props.drawing) return
    event.preventDefault()
    emit('draw-finish')
  })
}

onMounted(() => {
  map = new maplibregl.Map({
    container: container.value!,
    style: STYLE_URL,
    center: [15, 45],
    zoom: 3,
    attributionControl: { compact: true },
  })
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
  map.on('style.load', () => {
    map!.setProjection({ type: 'globe' })
    addLayers(map!)
    registerInteractions(map!)
    ready.value = true
    renderShapes()
  })
})

onBeforeUnmount(() => {
  endDrag()
  map?.remove()
})

watch(
  () => props.shapes.map((shape) => [shape.id, shape.name, shape.color, shape.center[0], shape.center[1]].join('|')).join(';'),
  () => ready.value && renderShapes(),
)
watch(
  () => props.draft,
  () => ready.value && setData('draft', draftFeatures()),
  { deep: true },
)
watch(
  () => props.drawing,
  (drawing) => {
    if (!map) return
    map.getCanvas().style.cursor = drawing ? 'crosshair' : ''
    if (drawing) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
  },
)

const boundsOf = (geometry: AreaGeometry) => {
  const bounds = new maplibregl.LngLatBounds()
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
  rings.forEach((ring) => ring.forEach(([lon, lat]) => bounds.extend([lon!, lat!])))
  return bounds
}

const focus = (shapes: Shape[]) => {
  if (!map || shapes.length === 0) return
  const bounds = new maplibregl.LngLatBounds()
  shapes.forEach((shape) => bounds.extend(boundsOf(props.geometryOf(shape))))
  const narrow = window.matchMedia('(max-width: 767px)').matches
  map.fitBounds(bounds, {
    padding: narrow ? { top: 40, bottom: window.innerHeight * 0.48, left: 30, right: 30 } : { top: 60, bottom: 60, left: 420, right: 60 },
    maxZoom: 14,
    duration: 1200,
  })
}

defineExpose({ focus })
</script>

<template>
  <div class="absolute inset-0">
    <div ref="container" class="h-full w-full" />
  </div>
</template>

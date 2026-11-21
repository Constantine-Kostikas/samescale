<script setup lang="ts">
import type { Position } from 'geojson'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MapView from './components/MapView.vue'
import { compareSizes, formatArea, type AreaUnit } from './geo/format'
import { nominatim, NominatimError, type Place } from './geo/nominatim'
import { decodeShare, encodeShare } from './geo/share'
import type { Shape, ShareEntry } from './geo/types'
import { loadPresets, type Preset } from './presets'
import { useShapes } from './useShapes'

const { shapes, add, find, moveTo, resetPosition, remove, isAway, nearestTo, geometryOf, shareEntries } = useShapes()

const mapView = ref<InstanceType<typeof MapView>>()
const presets = ref<Preset[]>([])
const units = ref<AreaUnit>(localStorage.getItem('samescale:units') === 'mi2' ? 'mi2' : 'km2')
watch(units, (value) => localStorage.setItem('samescale:units', value))

const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined
const showNotice = (message: string, durationMs = 4000) => {
  notice.value = message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = ''), durationMs)
}

const query = ref('')
const searching = ref(false)
const results = ref<Place[]>([])
const searchError = ref('')
const searchInput = ref<HTMLInputElement>()

const placingId = ref<string | null>(null)
const placingShape = computed(() => (placingId.value ? find(placingId.value) : undefined))
const placeTargets = computed(() => shapes.value.filter((shape) => shape.id !== placingId.value))

const drawing = ref(false)
const draft = ref<Position[]>([])
let drawnCount = 0

const comparedIds = ref<[string, string] | null>(null)

const comparison = computed(() => {
  const chosen = comparedIds.value && [find(comparedIds.value[0]), find(comparedIds.value[1])]
  const [a, b] = chosen?.every(Boolean) ? (chosen as Shape[]) : shapes.value.slice(-2)
  return a && b ? compareSizes(a, b) : ''
})

const dragShape = (id: string, center: Position) => {
  moveTo(id, center)
  const neighbor = nearestTo(id)
  if (neighbor) comparedIds.value = [id, neighbor.id]
}

const clearSearch = () => {
  results.value = []
  searchError.value = ''
}

const submitSearch = async () => {
  if (!query.value.trim() || searching.value) return
  searching.value = true
  clearSearch()
  try {
    results.value = await nominatim.search(query.value)
    if (results.value.length === 0) searchError.value = `No places found for "${query.value.trim()}". Try adding the country.`
  } catch (error) {
    searchError.value = error instanceof NominatimError ? error.message : 'The place search failed. Try again, or pick a preset.'
  } finally {
    searching.value = false
  }
}

const chooseResult = (place: Place) => {
  if (placingShape.value) {
    moveTo(placingShape.value.id, place.center)
    mapView.value?.focus([placingShape.value])
    stopPlacing()
    return
  }
  if (!place.geometry) return
  const shape = add({ name: place.name, source: { kind: 'osm', osmType: place.osmType, osmId: place.osmId }, geometry: place.geometry })
  mapView.value?.focus([shape])
  clearSearch()
  query.value = ''
}

const addPreset = (event: Event) => {
  const select = event.target as HTMLSelectElement
  const preset = presets.value.find((candidate) => candidate.id === select.value)
  select.value = ''
  if (!preset) return
  const shape = add({ name: preset.name, source: { kind: 'preset', presetId: preset.id }, geometry: preset.geometry })
  mapView.value?.focus([shape])
}

const startPlacing = (shape: Shape) => {
  cancelDrawing()
  placingId.value = shape.id
  clearSearch()
  query.value = ''
  searchInput.value?.focus()
}

const stopPlacing = () => {
  placingId.value = null
  clearSearch()
  query.value = ''
}

const placeOverShape = (target: Shape) => {
  const shape = placingShape.value
  if (!shape) return
  moveTo(shape.id, target.center)
  comparedIds.value = [shape.id, target.id]
  mapView.value?.focus([shape, target])
  stopPlacing()
}

const startDrawing = () => {
  stopPlacing()
  drawing.value = true
  draft.value = []
}

const cancelDrawing = () => {
  drawing.value = false
  draft.value = []
}

const samePoint = (a: Position, b: Position) => Math.abs(a[0]! - b[0]!) < 1e-7 && Math.abs(a[1]! - b[1]!) < 1e-7

const finishDrawing = () => {
  const points = draft.value.filter((point, index, all) => index === 0 || !samePoint(point, all[index - 1]!))
  if (points.length < 3) {
    showNotice('Click at least three points to draw an area.')
    return
  }
  const outline = [...points, points[0]!]
  drawnCount += 1
  const shape = add({ name: `Drawn area ${drawnCount}`, source: { kind: 'drawn', outline }, geometry: { type: 'Polygon', coordinates: [outline] } })
  cancelDrawing()
  mapView.value?.focus([shape])
}

const focusShape = (shape: Shape) => mapView.value?.focus([shape])

const shareLink = async () => {
  try {
    await navigator.clipboard.writeText(location.href)
    showNotice('Link copied. Anyone who opens it sees these shapes in these positions.')
  } catch {
    showNotice('Copy the address from your browser bar to share these shapes.')
  }
}

let hashTimer: ReturnType<typeof setTimeout> | undefined
let restoring = false
watch(
  shareEntries,
  (entries) => {
    if (restoring) return
    clearTimeout(hashTimer)
    hashTimer = setTimeout(() => {
      const url = entries.length ? `#s=${encodeShare(entries)}` : location.pathname + location.search
      history.replaceState(null, '', url)
    }, 300)
  },
  { deep: true },
)

const restoreEntry = async (entry: ShareEntry): Promise<boolean> => {
  const { source, center } = entry
  if (source.kind === 'preset') {
    const preset = presets.value.find((candidate) => candidate.id === source.presetId)
    if (!preset) return false
    add({ name: preset.name, source, geometry: preset.geometry, center })
    return true
  }
  if (source.kind === 'drawn') {
    drawnCount += 1
    add({ name: entry.name ?? `Drawn area ${drawnCount}`, source, geometry: { type: 'Polygon', coordinates: [source.outline] }, center })
    return true
  }
  const place = await nominatim.lookup(source.osmType, source.osmId)
  if (!place?.geometry) return false
  add({ name: place.name, source, geometry: place.geometry, center })
  return true
}

const restoreFromHash = async () => {
  const match = /^#s=(.+)$/.exec(location.hash)
  if (!match) return
  const entries = decodeShare(match[1]!)
  let failed = 0
  // Keep the original link intact until restoring finishes, so shapes that fail to load aren't dropped from it.
  restoring = true
  for (const entry of entries) {
    try {
      if (!(await restoreEntry(entry))) failed += 1
    } catch {
      failed += 1
    }
  }
  restoring = false
  if (failed > 0) showNotice(`${failed} shape${failed === 1 ? '' : 's'} from the link couldn't be loaded.`, 8000)
  if (shapes.value.length) setTimeout(() => mapView.value?.focus(shapes.value), 300)
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    cancelDrawing()
    stopPlacing()
  }
  if (event.key === 'Enter' && drawing.value) finishDrawing()
  if ((event.key === 'Backspace' || (event.key === 'z' && (event.metaKey || event.ctrlKey))) && drawing.value) {
    event.preventDefault()
    draft.value = draft.value.slice(0, -1)
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  presets.value = await loadPresets()
  await restoreFromHash()
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-[#c9d6de]">
    <MapView
      ref="mapView"
      :shapes="shapes"
      :geometry-of="geometryOf"
      :drawing="drawing"
      :draft="draft"
      @move="dragShape"
      @draw-point="(point) => draft.push(point)"
      @draw-finish="finishDrawing"
    />

    <aside
      class="panel absolute inset-x-0 bottom-0 z-10 flex max-h-[48vh] flex-col overflow-hidden rounded-t-[22px] bg-paper text-ink shadow-[0_-8px_30px_rgba(27,43,58,0.18)] md:inset-x-auto md:top-4 md:bottom-auto md:left-4 md:max-h-[calc(100vh-2rem)] md:w-[380px] md:rounded-[18px] md:shadow-[0_10px_40px_rgba(27,43,58,0.22)]"
      aria-label="Same Scale controls"
    >
      <header class="px-5 pt-4 pb-3 md:pt-5">
        <h1 class="text-[1.35rem] leading-tight font-semibold tracking-[-0.01em]">Same Scale</h1>
        <p class="mt-1 text-[0.9rem] leading-snug text-ink-soft">
          Flat maps stretch places near the poles. Move a place anywhere on the globe and see its true size.
        </p>
      </header>

      <div class="flex-1 overflow-y-auto px-5 pb-4">
        <section v-if="drawing" class="rounded-xl bg-white/70 p-4" aria-live="polite">
          <p class="text-[0.95rem] font-medium">Click the map to outline an area.</p>
          <p class="mt-1 text-sm text-ink-soft">
            {{ draft.length }} point{{ draft.length === 1 ? '' : 's' }} so far. Double-click or press Enter to finish.
          </p>
          <div class="mt-3 flex gap-2">
            <button class="btn-primary" :disabled="draft.length < 3" @click="finishDrawing">Finish area</button>
            <button class="btn" :disabled="draft.length === 0" @click="draft = draft.slice(0, -1)">Undo point</button>
            <button class="btn" @click="cancelDrawing">Cancel</button>
          </div>
        </section>

        <template v-else>
          <section v-if="placingShape" class="mb-3 rounded-xl border-2 p-3" :style="{ borderColor: placingShape.color }">
            <p class="text-[0.95rem] font-medium">Place {{ placingShape.name }} over…</p>
            <div v-if="placeTargets.length" class="mt-2 flex flex-wrap gap-1.5">
              <button v-for="target in placeTargets" :key="target.id" class="chip" @click="placeOverShape(target)">
                <span class="swatch" :style="{ background: target.color }" />
                {{ target.name }}
              </button>
            </div>
            <p class="mt-2 text-sm text-ink-soft">
              {{ placeTargets.length ? 'Or search for any place below.' : 'Search for any place below.' }}
            </p>
            <button class="mt-2 text-sm font-medium underline underline-offset-2" @click="stopPlacing">Cancel</button>
          </section>

          <form class="flex gap-2" role="search" @submit.prevent="submitSearch">
            <label class="sr-only" for="place-search">Search for a place</label>
            <input
              id="place-search"
              ref="searchInput"
              v-model="query"
              type="search"
              autocomplete="off"
              :placeholder="placingShape ? 'Where should it go?' : 'Search a city, district, or region'"
              class="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-[0.95rem] outline-none focus:border-ink focus:ring-2 focus:ring-ink/15"
            />
            <button class="btn-primary" type="submit" :disabled="searching || !query.trim()">
              {{ searching ? 'Searching' : 'Search' }}
            </button>
          </form>

          <p v-if="searchError" class="mt-2 text-sm text-[#b4361c]" role="alert">{{ searchError }}</p>

          <ul v-if="results.length" class="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
            <li v-for="place in results" :key="`${place.osmType}${place.osmId}`">
              <button
                class="w-full px-3 py-2 text-left hover:bg-paper focus-visible:bg-paper disabled:cursor-not-allowed disabled:opacity-55"
                :disabled="!placingShape && !place.geometry"
                @click="chooseResult(place)"
              >
                <span class="block text-[0.92rem] font-medium">{{ place.name }}</span>
                <span class="block truncate text-xs text-ink-soft">{{ place.displayName }}</span>
                <span v-if="!placingShape && !place.geometry" class="block text-xs text-ink-soft italic">No boundary available</span>
              </button>
            </li>
          </ul>

          <div v-if="!placingShape" class="mt-3 flex gap-2">
            <label class="sr-only" for="preset">Add a preset</label>
            <select id="preset" class="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-[0.92rem]" @change="addPreset">
              <option value="">Add a well-known place…</option>
              <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
            </select>
            <button class="btn" @click="startDrawing">Draw an area</button>
          </div>
        </template>

        <p v-if="comparison" class="comparison mt-5 text-[1.15rem] leading-snug font-semibold tracking-[-0.01em]" aria-live="polite">
          {{ comparison }}
        </p>

        <ul v-if="shapes.length" class="mt-4 space-y-2">
          <li
            v-for="shape in shapes"
            :key="shape.id"
            class="rounded-lg border-l-[5px] bg-white py-2.5 pr-2 pl-3"
            :style="{ borderLeftColor: shape.color }"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span class="truncate text-[0.95rem] font-medium">{{ shape.name }}</span>
              <span class="area shrink-0 text-[1.05rem] font-semibold">{{ formatArea(shape.areaKm2, units) }}</span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.82rem] font-medium text-ink-soft">
              <button class="link" @click="startPlacing(shape)">Place over…</button>
              <button class="link" @click="focusShape(shape)">Show</button>
              <button v-if="isAway(shape)" class="link" @click="resetPosition(shape.id)">Send home</button>
              <button class="link" @click="remove(shape.id)">Remove</button>
            </div>
          </li>
        </ul>

        <p v-else-if="!drawing" class="mt-5 text-sm text-ink-soft">
          Add a place to start. Then add a second one, drag it over the first, and compare.
        </p>
      </div>

      <footer class="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5 text-sm">
        <div class="flex rounded-md border border-line bg-white p-0.5" role="group" aria-label="Area units">
          <button class="unit" :class="{ 'unit-active': units === 'km2' }" :aria-pressed="units === 'km2'" @click="units = 'km2'">km²</button>
          <button class="unit" :class="{ 'unit-active': units === 'mi2' }" :aria-pressed="units === 'mi2'" @click="units = 'mi2'">mi²</button>
        </div>
        <button class="btn" :disabled="!shapes.length" @click="shareLink">Copy share link</button>
      </footer>
    </aside>

    <div
      v-if="notice"
      class="absolute top-4 left-1/2 z-20 w-[min(92vw,420px)] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-center text-sm text-white shadow-lg md:top-auto md:bottom-6"
      role="status"
    >
      {{ notice }}
    </div>
  </div>
</template>

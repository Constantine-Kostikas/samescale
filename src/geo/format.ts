export type AreaUnit = 'km2' | 'mi2'

const SQ_MILES_PER_SQ_KM = 0.386102
const UNIT_LABEL: Record<AreaUnit, string> = { km2: 'km²', mi2: 'mi²' }

const formatNumber = (value: number) => {
  const digits = value < 1 ? 2 : value < 100 ? 1 : 0
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export const formatArea = (km2: number, unit: AreaUnit) =>
  `${formatNumber(unit === 'km2' ? km2 : km2 * SQ_MILES_PER_SQ_KM)} ${UNIT_LABEL[unit]}`

interface Sized {
  name: string
  areaKm2: number
}

export const compareSizes = (a: Sized, b: Sized): string => {
  const [larger, smaller] = a.areaKm2 >= b.areaKm2 ? [a, b] : [b, a]
  if (smaller.areaKm2 <= 0) return ''
  const ratio = larger.areaKm2 / smaller.areaKm2
  if (ratio < 1.1) {
    const percent = ((ratio - 1) * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })
    return `${larger.name} is ${percent}% larger than ${smaller.name}.`
  }
  const formatted = ratio.toLocaleString('en-US', { maximumFractionDigits: ratio < 100 ? 1 : 0 })
  return `${larger.name} is ${formatted} times the size of ${smaller.name}.`
}

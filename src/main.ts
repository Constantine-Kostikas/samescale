import { createApp } from 'vue'
import '@fontsource-variable/instrument-sans'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}

import { ipcRenderer } from 'electron';
// This renderer receives exactly one main-owned channel and no native methods.
ipcRenderer.once('robopomelo:parser-port', (event) => {
  if (event.ports.length !== 1) return;
  window.postMessage({ type: 'robopomelo:parser-port' }, window.location.origin, event.ports);
});

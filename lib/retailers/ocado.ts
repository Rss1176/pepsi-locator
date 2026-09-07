import { htmlSearchAdapter } from './html-adapter';

export const ocado = htmlSearchAdapter({
  id: 'ocado',
  origin: 'https://www.ocado.com',
  searchUrl: 'https://www.ocado.com/search?entry=pepsi%20max',
  stateMarkers: ['window.__PRELOADED_STATE__'],
});

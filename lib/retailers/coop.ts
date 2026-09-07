import { htmlSearchAdapter } from './html-adapter';

export const coop = htmlSearchAdapter({
  id: 'coop',
  origin: 'https://www.coop.co.uk',
  searchUrl: 'https://www.coop.co.uk/products/search?q=pepsi%20max',
  stateMarkers: ['window.__NUXT__', 'window.__PRELOADED_STATE__'],
});

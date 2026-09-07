import { htmlSearchAdapter } from './html-adapter';

export const morrisons = htmlSearchAdapter({
  id: 'morrisons',
  origin: 'https://groceries.morrisons.com',
  searchUrl: 'https://groceries.morrisons.com/search?entry=pepsi%20max',
  stateMarkers: ['window.__PRELOADED_STATE__', 'window.__INITIAL_STATE__'],
});

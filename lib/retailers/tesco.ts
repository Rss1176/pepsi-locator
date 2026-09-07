import { htmlSearchAdapter } from './html-adapter';

/**
 * Tesco renders search results server side and ships the same data as a Redux
 * state attribute, which survives their markup changes better than the DOM does.
 */
export const tesco = htmlSearchAdapter({
  id: 'tesco',
  origin: 'https://www.tesco.com',
  searchUrl: 'https://www.tesco.com/groceries/en-GB/search?query=pepsi%20max',
  stateMarkers: ['window.__WAPPS_DATA__', 'window.__PRELOADED_STATE__'],
  stateAttribute: 'data-redux-state',
});

import { htmlSearchAdapter } from './html-adapter';

export const aldi = htmlSearchAdapter({
  id: 'aldi',
  origin: 'https://groceries.aldi.co.uk',
  searchUrl: 'https://groceries.aldi.co.uk/en-GB/Search?keywords=pepsi%20max',
  stateMarkers: ['window.__INITIAL_STATE__'],
});

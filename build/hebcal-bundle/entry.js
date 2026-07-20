// Bundle entry point. Exposes the same window.hebcal global the rest of the
// platform (toolkit.js, reader.js) already expects, and pulls in
// @hebcal/learning purely for its side effect of registering Daf Yomi,
// Rambam Yomi (1 & 3 chapter), Mishna Yomi, Nach Yomi, etc. with
// @hebcal/core's DailyLearning.lookup(name, hdate) API.
import * as hebcalCore from '@hebcal/core';
import '@hebcal/learning';

if (typeof window !== 'undefined') {
  window.hebcal = Object.assign(window.hebcal || {}, hebcalCore);
}

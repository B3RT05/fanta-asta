const fs = require('fs');
const { parseListone } = require('./dist/logic/parseListone.js');
const { proposeTiers } = require('./dist/logic/tiering.js');
const { predictPrices } = require('./dist/logic/pricing.js');
const { DEFAULT_LEAGUE } = require('./dist/logic/types.js');

const players = parseListone(new Uint8Array(fs.readFileSync('tests/fixtures/quotazioni.xlsx')));
const { tiers } = proposeTiers(players);
const prices = predictPrices(players, tiers, DEFAULT_LEAGUE);

const total = [...prices.values()].reduce((s, r) => s + r.base, 0);
const totalCredits = DEFAULT_LEAGUE.budget * DEFAULT_LEAGUE.teams.length;
const tolerance = 0.1;
const lower = totalCredits * (1 - tolerance);
const upper = totalCredits * (1 + tolerance);

console.log('Total Credits:', totalCredits);
console.log('Sum of base prices:', total);
console.log('Lower bound (90%):', lower);
console.log('Upper bound (110%):', upper);
console.log('Within tolerance:', total >= lower && total <= upper);
console.log('Percentage of total:', ((total / totalCredits) * 100).toFixed(2) + '%');

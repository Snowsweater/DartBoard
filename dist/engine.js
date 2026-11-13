/** Pure darts rules and training analytics. Segment IDs are S1…S20, D1…D20,
 * T1…T20, SB (25), DB (50) and MISS. All finishes use double-out. */
export const SEGMENTS = Object.freeze([
  ...Array.from({length: 20}, (_, i) => ({id: `S${i + 1}`, label: `${i + 1}`, score: i + 1, number: i + 1, multiplier: 1, isDouble: false})),
  ...Array.from({length: 20}, (_, i) => ({id: `D${i + 1}`, label: `D${i + 1}`, score: (i + 1) * 2, number: i + 1, multiplier: 2, isDouble: true})),
  ...Array.from({length: 20}, (_, i) => ({id: `T${i + 1}`, label: `T${i + 1}`, score: (i + 1) * 3, number: i + 1, multiplier: 3, isDouble: false})),
  {id: 'SB', label: '25', score: 25, number: 25, multiplier: 1, isDouble: false},
  {id: 'DB', label: 'Bull', score: 50, number: 25, multiplier: 2, isDouble: true},
  {id: 'MISS', label: 'Miss', score: 0, number: 0, multiplier: 0, isDouble: false}
].map(Object.freeze));

const byId = new Map(SEGMENTS.map(segment => [segment.id, segment]));
const aliases = {'25': 'SB', '50': 'DB', 'BULL': 'DB', 'BULLSEYE': 'DB', 'D25': 'DB', 'S25': 'SB', 'OUTER BULL': 'SB', 'INNER BULL': 'DB', '0': 'MISS', 'M': 'MISS'};

export function parseSegment(value) {
  if (value && typeof value === 'object') value = value.id ?? value.segment;
  if (value == null) return null;
  let id = String(value).trim().toUpperCase();
  id = aliases[id] || id;
  if (/^(?:[1-9]|1\d|20)$/.test(id)) id = `S${id}`;
  return byId.get(id) || null;
}

/** A bust loses the whole visit, so pass the score at the visit's start. */
export function applyThrow(remaining, value, turnStart = remaining) {
  const segment = parseSegment(value);
  if (!segment) throw new TypeError('Choose a valid dartboard segment.');
  if (!Number.isInteger(remaining) || remaining < 2 || !Number.isInteger(turnStart) || turnStart < remaining) {
    throw new RangeError('Remaining and visit-start scores must be valid whole numbers.');
  }
  const next = remaining - segment.score;
  const reason = next < 0 ? 'Score exceeded' : next === 1 ? 'Cannot leave 1' : next === 0 && !segment.isDouble ? 'Finish on a double' : null;
  if (reason) return {remaining: turnStart, bust: true, checkout: false, reason, segment: segment.id};
  return {remaining: next, bust: false, checkout: next === 0, reason: next === 0 ? 'Checkout' : null, segment: segment.id};
}

const doubles = SEGMENTS.filter(segment => segment.isDouble);
const doubleByScore = new Map(doubles.map(segment => [segment.score, segment]));
const scoringSegments = SEGMENTS.filter(segment => segment.score > 0);
const preferredDoubles = [20, 16, 18, 12, 10, 8, 6, 4, 2, 14, 15, 9, 5, 3, 1, 11, 13, 17, 19, 7, 25];
const doubleRank = number => preferredDoubles.indexOf(number) * 2;
// Familiar three-dart routes make the plan easy to rehearse. Alternatives
// remain available; a valid shorter finish always takes priority.
const familiarRoutes = {
  111: 'T20 S11 D20', 112: 'T20 S12 D20', 113: 'T20 S13 D20', 114: 'T20 S14 D20',
  115: 'T20 S15 D20', 116: 'T20 S16 D20', 117: 'T20 S17 D20', 118: 'T20 S18 D20',
  119: 'T19 T10 D16', 120: 'T20 S20 D20', 121: 'T20 T11 D14', 122: 'T18 T20 D4',
  123: 'T19 T16 D9', 124: 'T20 T16 D8', 125: 'SB T20 D20', 126: 'T19 T19 D6',
  127: 'T20 T17 D8', 128: 'T18 T14 D16', 129: 'T19 T16 D12', 130: 'T20 T20 D5',
  131: 'T20 T13 D16', 132: 'SB T19 DB', 133: 'T20 T19 D8', 134: 'T20 T14 D16',
  135: 'SB T20 DB', 136: 'T20 T20 D8', 137: 'T20 T19 D10', 138: 'T20 T18 D12',
  139: 'T20 T13 D20', 140: 'T20 T20 D10', 141: 'T20 T19 D12', 142: 'T20 T14 D20',
  143: 'T20 T17 D16', 144: 'T20 T20 D12', 145: 'T20 T15 D20', 146: 'T20 T18 D16',
  147: 'T20 T17 D18', 148: 'T20 T20 D14', 149: 'T20 T19 D16', 150: 'T20 T18 D18',
  151: 'T20 T17 D20', 152: 'T20 T20 D16', 153: 'T20 T19 D18', 154: 'T20 T18 D20',
  155: 'T20 T19 D19', 156: 'T20 T20 D18', 157: 'T20 T19 D20', 158: 'T20 T20 D19',
  160: 'T20 T20 D20', 161: 'T20 T17 DB', 164: 'T20 T18 DB', 167: 'T20 T19 DB',
  170: 'T20 T20 DB'
};
function routeCost(route) {
  let cost = route.length * 1000 + doubleRank(route.at(-1).number);
  for (const [index, segment] of route.slice(0, -1).entries()) {
    if (segment.multiplier === 1) cost += 1 + (20 - Math.min(segment.number, 20)) * 0.12;
    if (segment.multiplier === 2) cost += 20;
    if (segment.multiplier === 3) cost += 4 + (20 - segment.number) * 0.75 + (segment.number < 10 ? 22 : 0);
    if (segment.id === 'SB' || segment.id === 'DB') cost += 10;
    cost += (60 - segment.score) * (route.length - index) * 0.005;
  }
  return cost;
}

function findRoutes(score, darts) {
  const routes = [];
  function visit(left, prefix) {
    const double = doubleByScore.get(left);
    if (double) routes.push([...prefix, double]);
    if (prefix.length + 1 >= darts) return;
    for (const segment of scoringSegments) {
      const next = left - segment.score;
      if (next >= 2 && next <= (darts - prefix.length - 2) * 60 + 50) visit(next, [...prefix, segment]);
    }
  }
  visit(score, []);
  routes.sort((a, b) => routeCost(a) - routeCost(b) || a.map(x => x.id).join().localeCompare(b.map(x => x.id).join()));
  const familiarIndex = routes.findIndex(route => route.map(x => x.id).join(' ') === familiarRoutes[score]);
  if (familiarIndex > 0 && routes[familiarIndex].length === routes[0].length) routes.unshift(...routes.splice(familiarIndex, 1));
  return routes;
}

function setupRoute(score, darts) {
  // Leave a useful double when possible; otherwise score heavily toward a
  // finish next visit. Avoid intentionally leaving 1 or ending on a non-double.
  const preferredLeaves = [40, 32, 36, 24, 20, 16, 12, 8, 4, 2, 50, 60, 80, 100, 120, 140, 160, 170];
  const candidates = [];
  const options = scoringSegments.filter(x => x.multiplier !== 2 && x.id !== 'DB');
  function visit(left, route) {
    if (route.length) {
      const leaveIndex = preferredLeaves.indexOf(left);
      const cost = leaveIndex >= 0 ? leaveIndex * 2 : left > 170 ? 300 + left : 100 + left;
      const orderCost = route.reduce((sum, id, index) => sum + (60 - byId.get(id).score) * (darts - index) * 0.0001, 0);
      candidates.push({route, remaining: left, cost: cost + orderCost});
    }
    if (route.length === darts) return;
    for (const segment of options) if (left - segment.score >= 2) visit(left - segment.score, [...route, segment.id]);
  }
  // A full three-dart setup is useful for bogey numbers; for high scores all
  // treble-20 scoring is the straightforward recommendation.
  if (score > 230) {
    const route = Array.from({length: darts}, () => 'T20');
    return {target: route[0], route, remaining: score - darts * 60};
  }
  visit(score, []);
  candidates.sort((a, b) => a.cost - b.cost || b.route.length - a.route.length);
  const result = candidates[0];
  return result ? {target: result.route[0], route: result.route, remaining: result.remaining} : null;
}

/** Suggest valid routes; these are options, not a claim of a unique best route.
 * The bull (DB, 50) counts as a double. */
export function getCheckout(score, darts = 3) {
  if (!Number.isInteger(score) || score < 2 || !Number.isInteger(darts) || darts < 1 || darts > 3) {
    return {finishable: false, route: [], alternatives: [], setup: null, message: 'Enter a whole score of 2 or more and 1–3 darts.'};
  }
  const routes = score <= 170 ? findRoutes(score, darts) : [];
  if (routes.length) {
    const route = routes[0].map(x => x.id);
    return {finishable: true, route, alternatives: routes.slice(1, 4).map(route => route.map(x => x.id)), setup: null, message: `Finish in ${route.length} dart${route.length === 1 ? '' : 's'}. End on a double.`};
  }
  const setup = setupRoute(score, darts);
  return {finishable: false, route: [], alternatives: [], setup, message: `No double-out finish with ${darts} dart${darts === 1 ? '' : 's'}. ${setup ? `Set up ${setup.remaining} for the next visit.` : 'Aim to leave a double.'}`};
}

/** Throw records: {segment:'T20', target:'T20', at?:ISO}. Missing/invalid
 * targets are excluded from hit-rate denominators, not treated as misses. */
export function sessionStats(records = []) {
  const rows = records.map(record => ({...record, actual: parseSegment(record.segment ?? record.hit ?? record), aim: parseSegment(record.target)})).filter(row => row.actual);
  const attempts = rows.filter(row => row.aim).length;
  const hits = rows.filter(row => row.aim && row.actual.id === row.aim.id).length;
  const score = rows.reduce((sum, row) => sum + row.actual.score, 0);
  const targetBreakdown = {};
  for (const row of rows) {
    if (!row.aim) continue;
    const target = targetBreakdown[row.aim.id] ||= {attempts: 0, hits: 0, hitRate: 0};
    target.attempts++;
    if (row.actual.id === row.aim.id) target.hits++;
    target.hitRate = target.hits / target.attempts * 100;
  }
  const visits = [];
  for (let i = 0; i < rows.length; i += 3) visits.push(rows.slice(i, i + 3).reduce((sum, row) => sum + row.actual.score, 0));
  return {throws: rows.length, hits, attempts, hitRate: attempts ? hits / attempts * 100 : null, score, threeDartAverage: rows.length ? score / rows.length * 3 : 0, bestVisit: visits.length ? Math.max(...visits) : 0, misses: rows.filter(row => row.actual.id === 'MISS').length, targetBreakdown};
}

/** Session-aware statistics. In x01 a bust cancels the whole visit and its
 * unused darts count toward the conventional three-dart average. `throws`
 * remains the actual logged count; `averageDarts` is the average denominator. */
export function trainingStats(session) {
  const records = Array.isArray(session.throws) ? session.throws : [];
  const result = {...sessionStats(records)};
  result.averageDarts = result.throws;
  if (session.mode !== 'x01') return result;
  const initial = session.initial ?? 501;
  result.score = initial - (session.remaining ?? initial);
  let visitPosition = 0, visitTotal = 0, bestVisit = 0, averageDarts = 0;
  for (const record of records) {
    const segment = parseSegment(record.segment);
    if (!segment) continue;
    visitPosition++;
    averageDarts++;
    visitTotal += segment.score;
    if (record.bust) {
      averageDarts += 3 - visitPosition;
      visitTotal = 0;
    }
    if (record.bust || record.visitEnd || visitPosition === 3) {
      bestVisit = Math.max(bestVisit, visitTotal);
      visitPosition = 0;
      visitTotal = 0;
    }
  }
  result.averageDarts = averageDarts;
  result.threeDartAverage = averageDarts ? result.score / averageDarts * 3 : 0;
  result.bestVisit = Math.max(bestVisit, visitTotal);
  return result;
}

export function aggregateSessions(sessions = []) {
  return sessionStats(sessions.flatMap(session => Array.isArray(session.throws) ? session.throws : Array.isArray(session.records) ? session.records : []));
}

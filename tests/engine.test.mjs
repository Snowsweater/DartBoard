import assert from 'node:assert/strict';
import {SEGMENTS, parseSegment, applyThrow, getCheckout, sessionStats, trainingStats} from '../dist/engine.js';

assert.equal(SEGMENTS.length, 63);
assert.equal(parseSegment('50').id, 'DB');
assert.equal(parseSegment('20').score, 20);
assert.equal(parseSegment('T21'), null);
assert.equal(parseSegment('T20').score, 60);
assert.equal(applyThrow(50, 'DB', 110).checkout, true);
assert.deepEqual(applyThrow(20, 'S20', 80), {remaining: 80, bust: true, checkout: false, reason: 'Finish on a double', segment: 'S20'});
assert.equal(applyThrow(20, 'T20', 80).remaining, 80);
assert.equal(applyThrow(20, 'S19', 80).bust, true);
assert.equal(applyThrow(40, 'D20', 100).remaining, 0);
assert.equal(applyThrow(32, 'MISS', 92).remaining, 32);
assert.throws(() => applyThrow(40, 'T99'));
assert.deepEqual(getCheckout(170).route, ['T20', 'T20', 'DB']);
assert.deepEqual(getCheckout(50, 1).route, ['DB']);
assert.equal(getCheckout(40, 1).finishable, true);
assert.equal(getCheckout(60, 1).finishable, false);
for (const score of [159, 162, 163, 165, 166, 168, 169]) assert.equal(getCheckout(score).finishable, false, `${score} is a bogey number`);
for (let score = 2; score <= 170; score++) if (![159, 162, 163, 165, 166, 168, 169].includes(score)) assert.equal(getCheckout(score).finishable, true, `${score} must have a three-dart finish`);
for (let darts = 1; darts <= 3; darts++) {
  for (let score = 2; score <= 170; score++) {
    const result = getCheckout(score, darts);
    for (const route of [result.route, ...result.alternatives].filter(route => route.length)) {
      assert.ok(route.length <= darts);
      assert.equal(route.reduce((sum, id) => sum + parseSegment(id).score, 0), score);
      assert.ok(parseSegment(route.at(-1)).isDouble);
      let remainder = score;
      for (let index = 0; index < route.length; index++) {
        const dart = applyThrow(remainder, route[index], score);
        assert.equal(dart.bust, false);
        remainder = dart.remaining;
        assert.equal(dart.checkout, index === route.length - 1);
      }
    }
    if (result.setup) {
      assert.ok(result.setup.route.length <= darts);
      assert.equal(score - result.setup.route.reduce((sum, id) => sum + parseSegment(id).score, 0), result.setup.remaining);
      assert.ok(result.setup.remaining >= 2);
    }
  }
}
const stats = sessionStats([{segment: 'T20', target: 'T20'}, {segment: 'S20', target: 'T20'}, {segment: 'MISS', target: 'T20'}, {segment: 'DB'}]);
assert.equal(stats.throws, 4);
assert.equal(stats.attempts, 3);
assert.equal(stats.hits, 1);
assert.ok(Math.abs(stats.hitRate - 100 / 3) < 0.0001);
assert.equal(stats.score, 130);
assert.equal(stats.threeDartAverage, 97.5);
assert.equal(stats.bestVisit, 80);
assert.equal(stats.misses, 1);
assert.equal(sessionStats([]).hitRate, null);
const earlyBust = trainingStats({mode:'x01',initial:40,remaining:0,throws:[{segment:'T20',bust:true,visitEnd:true},{segment:'D20',visitEnd:true}]});
assert.equal(earlyBust.throws,2);
assert.equal(earlyBust.averageDarts,4);
assert.equal(earlyBust.score,40);
assert.equal(earlyBust.threeDartAverage,30);
assert.equal(earlyBust.bestVisit,40);
const wholeVisitBust = trainingStats({mode:'x01',initial:100,remaining:0,throws:[{segment:'T20'},{segment:'S20'},{segment:'T20',bust:true,visitEnd:true},{segment:'T20'},{segment:'S20'},{segment:'D10',visitEnd:true}]});
assert.equal(wholeVisitBust.averageDarts,6);
assert.equal(wholeVisitBust.score,100);
assert.equal(wholeVisitBust.threeDartAverage,50);
assert.equal(wholeVisitBust.bestVisit,100);
const secondDartBust = trainingStats({mode:'x01',initial:301,remaining:121,throws:[{segment:'T20'},{segment:'T20'},{segment:'T20',visitEnd:true},{segment:'T20'},{segment:'T20',bust:true,visitEnd:true}]});
assert.equal(secondDartBust.throws,5);
assert.equal(secondDartBust.averageDarts,6);
assert.equal(secondDartBust.threeDartAverage,90);
assert.equal(secondDartBust.bestVisit,180);
const partialVisit = trainingStats({mode:'x01',initial:301,remaining:221,throws:[{segment:'T20'},{segment:'S20'}]});
assert.equal(partialVisit.averageDarts,2);
assert.equal(partialVisit.threeDartAverage,120);
assert.equal(partialVisit.bestVisit,80);
const accuracy = trainingStats({mode:'accuracy',throws:[{segment:'T20',target:'T20'},{segment:'S20',target:'T20'}]});
assert.equal(accuracy.averageDarts,accuracy.throws);
assert.equal(accuracy.threeDartAverage,120);
assert.equal(accuracy.hitRate,50);
assert.equal(trainingStats({mode:'x01',initial:301,remaining:301,throws:[]}).threeDartAverage,0);
console.log('Darts rules, all suggested checkout routes for 2–170 with 1–3 darts, busts, and analytics passed.');

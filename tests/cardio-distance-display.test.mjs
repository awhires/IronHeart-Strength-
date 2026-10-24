import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCardioDistance,formatCardioSpeed} from '../shared/cardio-distance-display.mjs';

test('cardio display converts canonical meters for both preferences without changing the source',()=>{
 const meters=[2840.02,6694.87,1775.83];
 assert.deepEqual(meters.map(m=>formatCardioDistance(m,'mi')),['1.76 mi','4.16 mi','1.10 mi']);
 assert.deepEqual(meters.map(m=>formatCardioDistance(m,'km')),['2.84 km','6.69 km','1.78 km']);
 assert.deepEqual(meters,[2840.02,6694.87,1775.83]);
 assert.equal(formatCardioDistance(null,'mi'),'—');
 assert.equal(formatCardioDistance(100,'mi',true),'109.36 yd');
 assert.equal(formatCardioDistance(100,'km',true),'100.00 m');
});

test('cycling speed follows the selected distance unit',()=>{
 assert.equal(formatCardioSpeed(5,'mi'),'11.18 mph');
 assert.equal(formatCardioSpeed(5,'km'),'18.00 km/h');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {attachRefreshTriggers} from '../shared/refresh-triggers.mjs';

function eventTarget(){const listeners=new Map();return {addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),emit:name=>listeners.get(name)?.(),listeners};}

test('native resume refreshes only when the Capacitor app becomes active and removes its listener',async()=>{
 const document=eventTarget(),window=eventTarget(),nativeListeners=new Map(),removed=[];document.visibilityState='visible';let refreshes=0;
 const app={addListener:async(name,fn)=>{nativeListeners.set(name,fn);return {remove:()=>removed.push(name)}}};
 const cleanup=attachRefreshTriggers({isNative:true,app,document,window,refresh:()=>{refreshes++;},intervalMs:60000});
 await new Promise(resolve=>setImmediate(resolve));
 nativeListeners.get('appStateChange')({isActive:false});nativeListeners.get('appStateChange')({isActive:true});
 assert.equal(refreshes,1,'resuming from background fetches a fresh snapshot');
 nativeListeners.get('appStateChange')({isActive:false});document.emit('visibilitychange');window.emit('focus');window.emit('pageshow');
 assert.equal(refreshes,1,'hidden native app events do not trigger overlapping refreshes');
 document.visibilityState='hidden';nativeListeners.get('appStateChange')({isActive:true});assert.equal(refreshes,2,'native resume refreshes even before WebView visibility updates');
 cleanup();assert.deepEqual(removed,['appStateChange']);
});

test('browser focus and visibility events refresh the data snapshot',()=>{
 const document=eventTarget(),window=eventTarget();document.visibilityState='hidden';let refreshes=0;
 const cleanup=attachRefreshTriggers({document,window,refresh:()=>{refreshes++;},intervalMs:60000});
 window.emit('focus');assert.equal(refreshes,0);
 document.visibilityState='visible';document.emit('visibilitychange');assert.equal(refreshes,1);
 window.emit('pageshow');assert.equal(refreshes,2);cleanup();
});

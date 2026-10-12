import assert from 'node:assert/strict';
import worker from '../src/index.js';

const hash = 'a'.repeat(64);
const mkApp = distribution => ({
  slug: 'hailite-manager',
  distribution,
  apk: { key:'releases/hailite-manager/hailite-manager-1.0.0.apk', version:'1.0.0', sha256:hash }
});

async function send(path,distribution) {
  let r2GetCalls=0, r2HeadCalls=0;
  const env={
    APP_APKS:{
      async head(){r2HeadCalls++;return {size:100}},
      async get(){r2GetCalls++;return {size:4,body:new Uint8Array([65,80,75,33])}}
    },
    ASSETS:{
      async fetch(){return new Response(JSON.stringify({apps:[mkApp(distribution)]}),{
        status:200,headers:{'content-type':'application/json'}
      })}
    }
  };
  const response=await worker.fetch(new Request('https://hailitelabs.com'+path),env);
  return {response,r2GetCalls,r2HeadCalls};
}

for(const status of ['paid','unpublished',undefined]) {
  const d=await send('/api/download/hailite-manager',status);
  assert.equal(d.response.status,404,'No public APK for '+status);
  assert.equal(d.r2GetCalls,0,'Do not even read paid APK bytes');
  const r=await send('/api/apps/releases',status);
  assert.equal(r.response.status,200);
  assert.deepEqual((await r.response.json()).releases,[]);
  assert.equal(r.r2HeadCalls,0,'Do not reveal private-paid release details');
}
const free=await send('/api/download/hailite-manager','free');
assert.equal(free.response.status,200,'Explicit free app can be downloaded');
assert.equal(free.r2GetCalls,1);
const rel=await send('/api/apps/releases','free');
assert.equal((await rel.response.json()).releases.length,1);
console.log('Paid R2 downloads safely blocked; free downloads explicitly opt-in.');

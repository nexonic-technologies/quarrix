import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overpass,OVERPASS} from '../src/main/sources/osm';
import {CancelledError} from '../src/main/util';
const response=(status:number,text='')=>({ok:status===200,status,text,url:'https://overpass-api.de/',ms:1,type:'application/json',link:'',truncated:false});
const wait=async()=>{};
test('Overpass uses bounded fallback on a genuine service interruption',async()=>{const calls:string[]=[];const r=await overpass('test',100,async url=>{calls.push(url);if(calls.length===1)throw new TypeError('fetch failed');return response(200,'{"elements":[]}');},wait);assert.equal(r.ok,true);assert.deepEqual(calls,OVERPASS);});
test('Overpass stops on refusals, rate limits, incomplete output and unexpected responses',async()=>{for(const r of [response(403),response(429),response(200,'{"elements":[],"remark":"runtime error"}'),response(200,'<html>')]){let calls=0;assert.equal((await overpass('test',100,async()=>{calls++;return r;},wait)).ok,false);assert.equal(calls,1);}});
test('Overpass preserves cancellation and local request limits',async()=>{for(const error of [new CancelledError(),new Error('daily request limit reached')]){let calls=0;await assert.rejects(()=>overpass('test',100,async()=>{calls++;throw error;},wait),e=>e===error);assert.equal(calls,1);}});

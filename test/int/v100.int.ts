import { test,before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as db from '../../src/main/db';
import * as crm from '../../src/main/crm';
import { save } from '../../src/main/settings';
import { migrateProposals,getProposal,saveProposal } from '../../src/main/proposals';
import { migratePublicOpportunities,listPublicOpportunities,savePublicOpportunity,deletePublicOpportunity } from '../../src/main/public-opportunities';
import { EMPTY_PROPOSAL } from '../../src/shared/proposals';
import { EMPTY_OPPORTUNITY } from '../../src/shared/public-opportunities';
import * as jobstore from '../../src/main/jobstore';
import {migrateDigest,centerOverview,setDigest,claimDigest,toggleSavedSearch} from '../../src/main/opportunity-center';
import {salesByCurrency,marketReport} from '../../src/main/market';
import {checkSources,sourceHealthSnapshot,verdict} from '../../src/main/health';
import {load,defaults,effectiveSettings,runtimeSettings} from '../../src/main/settings';
import {JOB_SOURCES,searchJobs} from '../../src/main/jobsearch';
import {cachedPublic} from '../../src/main/public-cache';
test('public cache coalesces concurrent checks, preserves dated offline results and respects refusals',async()=>{
 const now=Date.parse('2026-11-22T00:00:00Z'),key='cache-regression';let calls=0;
 const fetcher=async()=>{calls++;return [{id:'example'}];};
 const [a,b]=await Promise.all([cachedPublic(key,fetcher,now),cachedPublic(key,fetcher,now)]);assert.equal(calls,1);assert.deepEqual(a,b);
 assert.equal((await cachedPublic(key,fetcher,now+1000)).cached,true);
 const stale=await cachedPublic(key,async()=>{throw Error('HTTP 503');},now+600000);assert.equal(stale.stale,true);assert.equal(stale.checkedAt,a.checkedAt);
 await assert.rejects(cachedPublic(key,async()=>{throw Error('HTTP 403');},now+600000),/403/);
 await assert.rejects(cachedPublic(key,async()=>{throw Error('HTTP 503');},now+8*864e5),/503/);
});
test('restricted boards are manual only and saved queries report unavailable sources',async()=>{
 const sources=['linkedin','indeed','google','rozee'];assert.ok(sources.every(s=>!JOB_SOURCES.includes(s)));
 const batches:string[]=[];const result=await searchJobs({keywords:'engineer',sources},(source,_jobs,error)=>{assert.match(error,/Manual access only/);batches.push(source);});
 assert.equal(result.jobs.length,0);assert.equal(result.errors.length,4);assert.deepEqual(batches.sort(),sources.sort());
});
import {spend,remaining} from '../../src/main/budget';
test('free-first pauses stored credentials without deleting them, and keeps local models available',()=>{
 const s=structuredClone(defaults);s.sources.placesKey='stored';s.verify.hunterKey='stored';s.verify.provider='hunter';s.ai={provider:'openai',apiKey:'stored',model:'',baseUrl:''};s.aiKeys={groq:'stored'};s.sdkKeys={foo:'stored'};
 const paused=effectiveSettings(s);assert.equal(paused.sources.placesKey,'');assert.equal(paused.verify.provider,'none');assert.equal(paused.ai.provider,'none');assert.deepEqual(paused.aiKeys,{});assert.deepEqual(paused.sdkKeys,{});assert.equal(s.sources.placesKey,'stored');assert.equal(effectiveSettings({...s,allowKeyedServices:true}).ai.apiKey,'stored');
 s.ai={provider:'ollama',apiKey:'',baseUrl:'http://localhost:11434',model:'local'};assert.equal(effectiveSettings(s).ai.provider,'ollama');s.ai.baseUrl='https://remote.example';assert.equal(effectiveSettings(s).ai.provider,'none');
 save({allowKeyedServices:false});assert.equal(runtimeSettings().allowKeyedServices,false);assert.throws(()=>spend('writing'),/paused/);assert.equal(remaining('writing'),0);save({allowKeyedServices:true,budgets:{writing:0}});assert.throws(()=>spend('writing'),/paused/);save({allowKeyedServices:false,budgets:{writing:50}});
});
before(()=>{db.openDb(join(process.env.QUARRIX_TEST_DIR!,'v100.db'));db.migrateData();crm.migrate();migrateProposals();migratePublicOpportunities();});
test('provider health respects exhausted budget and preserves a dated local snapshot',async()=>{
 const original=load().budgets;save({budgets:{...original,npi:1}});db.addUsage('npi',1);const [r]=await checkSources('npi');assert.equal(r.status,'warn');assert.equal(r.ms,0);assert.ok(r.checkedAt);assert.equal((await checkSources('npi'))[0].checkedAt,r.checkedAt);assert.equal(sourceHealthSnapshot().find(x=>x.id==='npi')?.checkedAt,r.checkedAt);assert.equal(verdict(200,'captcha')[0],'warn');assert.equal(verdict(403,'')[0],'fail');assert.match(verdict(200,'{}')[1],/not verified/);save({budgets:original});
});
test('duplicate suggestions are scoped before taking the group limit',()=>{
 const make=(client:string,n:string)=>db.upsertLead({name:n,source:'manual',source_ref:n,client})[0];const a=make('Duplicate A','A one'),b=make('Duplicate A','A two'),c=make('Duplicate B','B one'),d=make('Duplicate B','B two');for(const id of [a,b,c,d])db.updateLead(id,{email:'same@example.com'});save({currentClient:'Duplicate B'});const groups=crm.duplicateGroups(1);assert.equal(groups.length,1);assert.deepEqual(groups[0].leads.map(x=>x.id),[c,d]);save({currentClient:''});db.deleteLeads([a,b,c,d]);
});
test('daily digest is opt-in, scoped and claimed once per day',()=>{
 jobstore.migrate();migrateDigest();save({currentClient:'Digest A'});const p=savePublicOpportunity({...EMPTY_OPPORTUNITY,title:'Due notice',deadline:'2026-11-20',url:'https://njp.gov.pk/jobs/345'});const w=db.saveWatch({category:'Dentists',place:'Lahore',client:'Digest A'});const date=new Date(2026,10,22,12);
 assert.equal(claimDigest('both',date),0);setDigest(true);assert.equal(centerOverview(date).notices.length,1);assert.equal(claimDigest('both',date),1);assert.equal(claimDigest('both',date),0);
 save({currentClient:'Digest B'});assert.equal(centerOverview(date).notices.length,0);assert.throws(()=>toggleSavedSearch('watch',w,false),/workspace/);save({currentClient:'Digest A'});toggleSavedSearch('watch',w,false);assert.equal(centerOverview(date).watches[0].enabled,false);deletePublicOpportunity(p.id!);db.deleteWatch(w);save({currentClient:''});
});
test('sales reports separate currencies and client scope',()=>{
 const [a]=db.upsertLead({name:'Sales A',source:'manual',source_ref:'sales-a',client:'Sales A',grade:'A',rating:4.5});const [b]=db.upsertLead({name:'Sales B',source:'manual',source_ref:'sales-b',client:'Sales B',grade:'B'});
 crm.saveDeal({title:'USD deal',lead_id:a,stage:'won',value:100,currency:'USD'});crm.saveDeal({title:'EUR deal',lead_id:a,stage:'won',value:200,currency:'EUR'});crm.saveDeal({title:'Other client',lead_id:b,stage:'won',value:900,currency:'USD'});
 assert.deepEqual(salesByCurrency('Sales A').map(x=>[x.currency,x.wonValue]),[['EUR',200],['USD',100]]);assert.equal(marketReport('grade','','','Sales A').groups[0].averageRating,4.5);db.deleteLeads([a,b]);
});
test('proposal persistence and migration are scoped and idempotent',()=>{
 const [id]=db.upsertLead({name:'A Business',source:'manual',source_ref:'proposal-a',client:'A'});
 save({currentClient:'A'});saveProposal(id,{...EMPTY_PROPOSAL,title:'Local proposal'});migrateProposals();assert.equal(getProposal(id).title,'Local proposal');
 save({currentClient:'B'});assert.throws(()=>getProposal(id),/workspace/);assert.throws(()=>saveProposal(id,EMPTY_PROPOSAL),/workspace/);
 save({currentClient:'A'});db.deleteLeads([id]);assert.equal((db.raw().prepare('SELECT COUNT(*) n FROM proposals').get() as any).n,0);save({currentClient:''});
});
test('public opportunities remain private to the selected workspace and persist through migration',()=>{
 save({currentClient:'A'});const p=savePublicOpportunity({...EMPTY_OPPORTUNITY,title:'Role',url:'https://njp.gov.pk/jobs/123'});assert.throws(()=>savePublicOpportunity({...EMPTY_OPPORTUNITY,title:'Duplicate',url:p.url}),/already saved/);migratePublicOpportunities();assert.equal(listPublicOpportunities().length,1);
 save({currentClient:'B'});assert.equal(listPublicOpportunities().length,0);assert.equal(deletePublicOpportunity(p.id!),0);assert.throws(()=>savePublicOpportunity({...p,title:'Changed'}),/workspace/);
 save({currentClient:'A'});assert.equal(deletePublicOpportunity(p.id!),1);save({currentClient:''});
});
test('editing a watchlist URL cannot duplicate a listing, including in all-clients view',()=>{
 save({currentClient:'A'}); const a=savePublicOpportunity({...EMPTY_OPPORTUNITY,title:'First',url:'https://njp.gov.pk/jobs/111'}); const b=savePublicOpportunity({...EMPTY_OPPORTUNITY,title:'Second',url:'https://njp.gov.pk/jobs/222'});
 save({currentClient:''}); assert.throws(()=>savePublicOpportunity({...b,url:a.url}),/already saved/); assert.equal(listPublicOpportunities().find(x=>x.id===b.id)?.url,b.url);
 deletePublicOpportunity(a.id!);deletePublicOpportunity(b.id!);
});
test('editing an email invalidates the previous mailbox verification',()=>{
 const [id]=db.upsertLead({name:'Email verification fixture',source:'manual',source_ref:'verification-edit',email:'old@example.com',email_status:'verified',email_checked_at:'2026-11-21T00:00:00Z'});
 db.updateLead(id,{email:'new@example.com'});assert.equal(db.getLead(id)?.email_status,'');assert.equal(db.getLead(id)?.email_checked_at,null);db.deleteLeads([id]);
});

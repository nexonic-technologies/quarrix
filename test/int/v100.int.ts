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
before(()=>{db.openDb(join(process.env.QUARRIX_TEST_DIR!,'v100.db'));db.migrateData();crm.migrate();migrateProposals();migratePublicOpportunities();});
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadQuality, leadReviewReason,jobQuality, parseRegistry, recommendLeads, recommendJobs, salarySamples } from '../src/shared/verified';

const checkedAt='2026-11-21T00:00:00Z', now=Date.parse('2026-11-22T00:00:00Z');
const lead={website:'https://example.com',provenance:JSON.stringify({checked:{website:'https://example.com',at:checkedAt}}),status:'new',grade:'A',relevance:80,evidence:70};
test('review reason distinguishes missing checks from reported conflicts and closure',()=>{assert.equal(leadReviewReason(lead,now),'recent');assert.equal(leadReviewReason({...lead,website:'https://other.example'},now),'unchecked');assert.equal(leadReviewReason(lead,now+91*864e5),'stale');assert.equal(leadReviewReason({...lead,details:'{"status":"closed_permanently"}'},now),'closed');assert.equal(leadReviewReason({...lead,provenance:'{"conflicts":{"city":[1,2]}}'},now),'conflict');});
test('freshness never treats missing, future, edited or conflicting evidence as confirmed',()=>{
 assert.equal(leadQuality(lead,now),'recent');assert.equal(leadQuality({...lead,website:'https://other.example'},now),'check');assert.equal(leadQuality(lead,now+91*864e5),'check');
 assert.equal(leadQuality({...lead,provenance:JSON.stringify({conflicts:{phone:[1,2]}})},now),'review');assert.equal(leadQuality({...lead,email_status:'invalid'},now),'review');
 assert.deepEqual(recommendLeads([lead,{...lead,status:'do_not_contact'},{...lead,website:'https://other.example'}],now),[lead]);
});
test('registry returns only exact legal name and country candidates and retains inactive status',()=>{
 const row={attributes:{lei:'HWUPKR0MPOU8FGXBT394',entity:{legalName:{name:'Apple Inc.'},legalAddress:{country:'US',city:'Cupertino'},status:'ACTIVE'},registration:{status:'LAPSED'}}};
 assert.equal(parseRegistry({data:[row]},'apple inc.','US')[0].registration,'LAPSED');assert.deepEqual(parseRegistry({data:[row]},'Apple','US'),[]);assert.deepEqual(parseRegistry({data:[row]},'Apple Inc.','GB'),[]);assert.throws(()=>parseRegistry({},'Apple Inc.','US'));
});
test('job warnings, age and reposts do not become verified; salary samples never mix currencies',()=>{
 assert.equal(jobQuality({snippet:'Pay an application fee'}),'review');assert.equal(jobQuality({ageDays:46}),'check');assert.equal(jobQuality({}),'unchecked');
 assert.equal(recommendJobs([{match:90,repost:true},{match:75},{match:40}]).length,1);
 assert.deepEqual(salarySamples([{salaryYearly:{currency:'USD',min:10,max:20,period:'year'}},{salaryYearly:{currency:'USD',min:30,max:40,period:'month'}},{salaryYearly:{currency:'EUR',min:5,max:10,period:'year'}},{salaryYearly:null}]),[{currency:'USD',count:2,min:20,max:30},{currency:'EUR',count:1,min:5,max:10}]);
});

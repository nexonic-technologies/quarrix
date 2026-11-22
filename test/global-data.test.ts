import {test} from 'node:test';import assert from 'node:assert/strict';
import {BLS_SERIES,parseBls,secCompany,REGIONAL_SOURCES,parseNationalRegistry,parseNycJobs} from '../src/shared/global-data';
test('national register parses exact IDs and rejects mismatches',()=>{
 assert.equal(parseNationalRegistry('NO','123456789',{organisasjonsnummer:'123456789',navn:'Example AS',konkurs:true}).status,'Bankruptcy reported');
 assert.throws(()=>parseNationalRegistry('NO','123456789',{organisasjonsnummer:'987654321',navn:'Other'}));
 assert.equal(parseNationalRegistry('FR','123456789',{results:[{siren:'123456789',nom_complet:'Example SA',etat_administratif:'C'}]}).status,'Closed registration');
 assert.throws(()=>parseNationalRegistry('FR','123456789',{results:[]}));
});
test('public vacancies keep external records only and deduplicate IDs',()=>{
 const row={job_id:'123',business_title:'Engineer',agency:'City agency',posting_type:'External',posting_date:'2026-11-01'};
 assert.deepEqual(parseNycJobs([row,row,{...row,job_id:'456',posting_type:'Internal'},{...row,job_id:'bad'}]),[{id:'123',title:'Engineer',agency:'City agency',posted:'2026-11-01'}]);
 assert.throws(()=>parseNycJobs({error:'unavailable'}));
});
test('official wages reject unavailable, foreign series and nonnumeric observations',()=>{
 const data={status:'REQUEST_SUCCEEDED',Results:{series:[{seriesID:BLS_SERIES,data:[{year:'2026',period:'M10',value:'38.10'},{year:'2025',period:'M12',value:'36.5'},{year:'2026',period:'M13',value:'99'},{year:'2026',period:'M09',value:'-'}]}]}};
 assert.deepEqual(parseBls(data).map(r=>[r.period,r.value]),[['2026-10',38.1],['2025-12',36.5]]);assert.throws(()=>parseBls({status:'REQUEST_FAILED'}));assert.throws(()=>parseBls({...data,Results:{series:[]}}));
});
test('SEC only returns matching operating entity and directory uses HTTPS',()=>{
 const data={cik:320193,entityType:'operating',name:'Apple Inc.',tickers:['AAPL'],sicDescription:'Computers'};assert.equal(secCompany(data,'0000320193').name,'Apple Inc.');assert.throws(()=>secCompany({...data,entityType:'individual'},'0000320193'));assert.throws(()=>secCompany(data,'0000000001'));assert.ok(REGIONAL_SOURCES.every(s=>new URL(s.url).protocol==='https:'));
});

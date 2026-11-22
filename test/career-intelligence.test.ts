import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exploreCareers, OCCUPATION_COUNT, learningPlan,relatedOccupations,type Occupation } from '../src/shared/career-intelligence';
test('related roles require shared catalog tools and learning plans omit known terms',()=>{
 const data=[{id:'a',title:'Current',skills:[],tools:['Tool A']},{id:'b',title:'Related',skills:['Skill B'],tools:['Tool A','Tool B']},{id:'c',title:'Unrelated',skills:['Skill B'],tools:['Tool C']}];
 const r=relatedOccupations('a',['tool a'],data);assert.equal(r.length,1);assert.equal(r[0].id,'b');assert.deepEqual(r[0].shared,['Tool A']);assert.ok(r[0].roadmap.every(x=>x.skill!=='Tool A'));assert.deepEqual(relatedOccupations('missing',[],data),[]);
});
test('learning plan uses only catalog exploration topics and stays bounded',()=>{
 const m={id:'1',title:'Role',score:60,titleMatches:[],skills:[],tools:[],explore:['A skill','B skill','A skill','C skill','D skill','E skill','F skill','G skill']};
 assert.deepEqual(learningPlan(m).map(x=>x.week),[1,1,2,2,3,3]);assert.equal(learningPlan(m)[2].skill,'C skill');
});

test('the complete official occupation catalog supports diverse careers', () => {
  assert.equal(OCCUPATION_COUNT, 1016);
  for (const [role, expected] of [['Software Developer', 'Software Developers'], ['Registered Nurse', 'Registered Nurses'], ['Graphic Designer', 'Graphic Designers'], ['Accountant', 'Accountants and Auditors']]) {
    const result = exploreCareers({ titles: [role], skills: [] });
    assert.ok(result.some(r => r.title === expected), role);
    assert.ok(result.every(r => r.score > 0 && r.score <= 100));
  }
});

test('matching uses whole software terms, deduplicates skills and explains evidence', () => {
  const catalog: Occupation[] = [
    { id: 'a', title: 'Software Developers', skills: ['Programming', 'Active Listening'], tools: ['Java', 'C++'] },
    { id: 'b', title: 'Web Designers', skills: ['Active Listening'], tools: ['JavaScript'] },
  ];
  const matches = exploreCareers({ titles: ['Software Developer'], skills: ['Java', 'JAVA', 'C++', 'Programming'] }, 8, catalog);
  assert.equal(matches[0].id, 'a');
  assert.deepEqual(matches[0].tools, ['java', 'c++']);
  assert.deepEqual(matches[0].skills, ['Programming']);
  assert.deepEqual(matches[0].explore, ['Active Listening']);
  assert.equal(matches.length, 1, 'Java is not JavaScript');
});

test('no fabricated results for empty or unsupported profiles; deterministic limit', () => {
  assert.deepEqual(exploreCareers({ titles: [], skills: [] }), []);
  assert.deepEqual(exploreCareers({ titles: ['zzzzzzzzz'], skills: ['zzzzzzzzz'] }), []);
  const p = { titles: ['Teacher'], skills: ['Speaking'] };
  assert.equal(exploreCareers(p, 2).length, 2);
  assert.deepEqual(exploreCareers(p, 2), exploreCareers(p, 2));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exploreCareers, OCCUPATION_COUNT, type Occupation } from '../src/shared/career-intelligence';

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

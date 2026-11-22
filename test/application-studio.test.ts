import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewResume, interviewTopics, dueItems, EMPTY_STUDIO, validDay,priorityQueue } from '../src/shared/application-studio';
test('priority queue sorts overdue and upcoming dates, excluding invalid and distant dates',()=>{
 const q=priorityQueue([{id:'later',title:'B',day:'2026-11-25',kind:'interview'},{id:'due',title:'A',day:'2026-11-22',kind:'task'},{id:'late',title:'C',day:'2026-11-20',kind:'deadline'},{id:'bad',title:'D',day:'2026-02-30',kind:'task'},{id:'far',title:'E',day:'2026-12-01',kind:'notice'}],'2026-11-22','2026-11-29');
 assert.deepEqual(q.map(x=>[x.id,x.due]),[['late','overdue'],['due','today'],['later','upcoming']]);
});
test('resume review finds actual headings and whole skill terms, without inventing experience', () => {
  const r = reviewResume('Summary\nExperience\nJava and Python\nname@example.com', ['Java', 'Python', 'SQL'], 'JavaScript and Python');
  assert.deepEqual(r.sections, ['Summary', 'Experience']); assert.deepEqual(r.matchedSkills, ['Python']); assert.equal(r.emailPresent, true);
  assert.deepEqual(interviewTopics(['Java', 'Python'], 'JavaScript and Python'), ['Python']);
});
test('planner distinguishes dates and rejects impossible dates', () => {
  assert.equal(validDay('2026-02-30'), false); assert.equal(validDay('2028-02-29'), true); assert.equal(validDay(''), true);
  const items = dueItems([{ id: 'a', title: 'Role', studio: { ...EMPTY_STUDIO, deadline: '2026-11-20', interview: '2026-11-22', followUp: '2026-11-24' } }], '2026-11-22');
  assert.deepEqual(items.map(x => x.kind), ['deadline', 'interview']);
});

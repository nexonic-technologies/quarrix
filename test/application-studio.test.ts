import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewResume, interviewTopics, dueItems, EMPTY_STUDIO, validDay } from '../src/shared/application-studio';
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

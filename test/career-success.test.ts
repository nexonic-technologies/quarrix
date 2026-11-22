import {test} from 'node:test';import assert from 'node:assert/strict';
import {resumeGap,upcomingItems,EMPTY_STUDIO} from '../src/shared/application-studio';
test('skill evidence requires actual text in the posting and resume',()=>{assert.deepEqual(resumeGap('Excel and SQL','Excel SQL Python',[ 'Excel','SQL','Python','C++']),{requested:['Excel','SQL','Python'],documented:['Excel','SQL'],notDocumented:['Python']});});
test('upcoming tasks exclude overdue and invalid dates',()=>{const j={id:'a',title:'Job',studio:{...EMPTY_STUDIO,deadline:'2026-11-23',interview:'2026-11-20',followUp:'2026-11-30'}};assert.deepEqual(upcomingItems([j],'2026-11-22','2026-11-29').map(x=>x.kind),['deadline']);});

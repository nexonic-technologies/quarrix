import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breaker, classifyReply, dryRun, explainDns, inWindowAt, localClock, nextWindow, zoneFor } from '../src/main/rules';

test('IANA time zones from coordinates and countries', () => {
  assert.equal(zoneFor(40.71, -74.0), 'America/New_York');
  assert.equal(zoneFor(31.52, 74.35), 'Asia/Karachi');
  assert.equal(zoneFor(-33.87, 151.21), 'Australia/Sydney');
  assert.equal(zoneFor(null, null, 'GB'), 'Europe/London');
  assert.equal(zoneFor(null, null, 'US'), '', 'multi-zone country without coordinates is unknown');
});

test('working hours respect daylight saving', () => {
  const w = { windowStart: 9, windowEnd: 17, weekdaysOnly: true };
  // 14:00 UTC on Wed 15 Jul 2026 = 10:00 EDT (UTC-4); on Wed 14 Jan 2026 = 09:00 EST (UTC-5)
  assert.equal(localClock(new Date('2026-07-15T14:00:00Z'), 'America/New_York').hour, 10);
  assert.equal(localClock(new Date('2026-01-14T14:00:00Z'), 'America/New_York').hour, 9);
  assert.equal(inWindowAt(new Date('2026-07-15T12:30:00Z'), 'America/New_York', w), false, '08:30 local');
  assert.equal(inWindowAt(new Date('2026-07-18T15:00:00Z'), 'America/New_York', w), false, 'Saturday');
  const n = nextWindow(new Date('2026-07-17T22:00:00Z'), 'Europe/London', w)!; // Fri 23:00 BST → Mon 09:00 BST
  assert.equal(n.toISOString(), '2026-07-20T08:00:00.000Z');
});

test('reply intent', () => {
  assert.equal(classifyReply('Re: hi', 'Please unsubscribe me from your list').intent, 'opt_out');
  assert.equal(classifyReply('Automatic reply: away', 'I am out of the office until Monday').intent, 'out_of_office');
  assert.equal(classifyReply('Re: website', 'Sounds good, send me pricing').intent, 'interested');
  assert.equal(classifyReply('Re: website', 'Can we book a call on Thursday?').intent, 'meeting');
  assert.equal(classifyReply('Re: website', 'Not interested, we already have an agency').intent, 'objection');
  assert.equal(classifyReply('Re: website', 'Maybe next quarter').intent, 'not_now');
  const mixed = classifyReply('Re', 'Not interested now but send me pricing');
  assert.equal(mixed.intent, 'unclear');
  assert.equal(mixed.review, true);
  assert.equal(classifyReply('Re', 'ok').intent, 'unclear');
});

test('bounce circuit breaker', () => {
  assert.equal(breaker({ sent: 10, bounced: 5, complaints: 0 }), '', 'too few sends to judge');
  assert.match(breaker({ sent: 50, bounced: 4, complaints: 0 }), /Bounce rate 8\.0%/);
  assert.equal(breaker({ sent: 50, bounced: 2, complaints: 0 }), '');
  assert.match(breaker({ sent: 400, bounced: 0, complaints: 3 }), /Complaint/);
});

test('SPF, DKIM and DMARC explained', () => {
  const ok = explainDns('acme.com', ['v=spf1 include:_spf.google.com ~all'], ['v=DMARC1; p=none; rua=mailto:x@acme.com'], { google: true }, '_spf.google.com');
  assert.deepEqual(ok.map((c) => c.ok), [true, true, true]);
  const bad = explainDns('acme.com', ['v=spf1 a ~all', 'v=spf1 mx ~all'], [], {});
  assert.deepEqual(bad.map((c) => c.ok), [false, false, false]);
  assert.match(bad[0].detail, /2 SPF records/);
  assert.match(bad[1].fix, /_dmarc\.acme\.com/);
});

test('dry run respects window, daily cap and blocks', () => {
  const w = { windowStart: 9, windowEnd: 17, weekdaysOnly: true };
  const due = [
    { id: 1, lead: 'A', email: 'a@a.com', zone: 'Europe/London', step: 0, dueAt: '2026-07-15T06:00:00Z', block: '' },
    { id: 2, lead: 'B', email: 'b@b.com', zone: 'Europe/London', step: 0, dueAt: '2026-07-15T06:00:00Z', block: '' },
    { id: 3, lead: 'C', email: 'c@c.com', zone: 'Europe/London', step: 0, dueAt: '2026-07-15T06:00:00Z', block: 'on the do-not-contact list' },
  ];
  const plan = dryRun(due, { now: new Date('2026-07-15T06:00:00Z'), cap: 1, sentToday: 0, gapMinutes: 5, window: w, days: 5 });
  assert.equal(plan.find((p) => p.id === 1)!.at, '2026-07-15T08:00:00.000Z', '09:00 BST');
  assert.equal(plan.find((p) => p.id === 2)!.at!.slice(0, 10), '2026-07-16', 'cap of 1 a day pushes to the next day');
  assert.equal(plan.find((p) => p.id === 3)!.at, null);
});

test('A/B subject test needs enough sends and a real difference', async () => {
  const { abResult, altSubject } = await import('../src/main/rules');
  assert.equal(abResult({ sent: 10, replies: 5 }, { sent: 10, replies: 0 }).winner, null, 'too few sends');
  const r = abResult({ sent: 200, replies: 30 }, { sent: 200, replies: 10 });
  assert.equal(r.winner, 'A'); assert.ok(r.p! < 0.01);
  assert.equal(abResult({ sent: 100, replies: 10 }, { sent: 100, replies: 11 }).winner, null);
  assert.notEqual(altSubject('Quick question about acme.com', { name: 'Acme', domain: 'acme.com' }).toLowerCase(), 'quick question about acme.com');
});

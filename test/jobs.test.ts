import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAts, isRecruiter, parseSalary, postingState, employerJobs } from '../src/main/ats';

test('hiring system detection from links', () => {
  assert.deepEqual(detectAts('https://boards.greenhouse.io/stripe/jobs/123'), { ats: 'greenhouse', slug: 'stripe', name: 'Stripe' });
  assert.equal(detectAts('https://job-boards.greenhouse.io/embed/job_board?for=figma')?.slug, 'figma');
  assert.deepEqual(detectAts('jobs.lever.co/netflix/abc'), { ats: 'lever', slug: 'netflix', name: 'Netflix' });
  assert.equal(detectAts('https://jobs.ashbyhq.com/linear')?.ats, 'ashby');
  assert.equal(detectAts('https://jobs.smartrecruiters.com/Visa/123')?.slug, 'Visa');
  assert.equal(detectAts('https://apply.workable.com/acme-co/')?.ats, 'workable');
  assert.equal(detectAts('https://acme.recruitee.com/o/dev')?.ats, 'recruitee');
  assert.equal(detectAts('https://acme.jobs.personio.de/')?.ats, 'personio');
  assert.equal(detectAts('https://acme.pinpointhq.com')?.ats, 'pinpoint');
  assert.deepEqual(detectAts('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite'), { ats: 'workday', slug: 'nvidia', name: 'Nvidia', host: 'nvidia.wd5.myworkdayjobs.com', site: 'NVIDIAExternalCareerSite' });
  assert.equal(detectAts('https://example.com/careers'), null);
});

test('salary parsing and yearly comparison', () => {
  assert.deepEqual(parseSalary('£45,000 - £55,000 a year'), { min: 45000, max: 55000, currency: 'GBP', period: 'year', yearlyMin: 45000, yearlyMax: 55000 });
  const h = parseSalary('$40-50/hr')!;
  assert.equal(h.period, 'hour'); assert.equal(h.yearlyMax, 104000); assert.equal(h.currency, 'USD');
  assert.equal(parseSalary('USD 120k')!.max, 120000);
  assert.equal(parseSalary('PKR 150000 per month')!.yearlyMin, 1800000);
  assert.equal(parseSalary('Competitive'), null);
});

test('closed posting detection', () => {
  assert.equal(postingState(404, '').state, 'closed');
  assert.equal(postingState(200, '<h1>Sorry, this job is no longer accepting applications</h1>').state, 'closed');
  assert.equal(postingState(200, '<h1>Senior Engineer</h1><button>Apply</button>').state, 'open');
  assert.equal(postingState(503, '').state, 'unknown');
});

test('recruiter detection', () => {
  assert.equal(isRecruiter('Hays Recruitment'), true);
  assert.equal(isRecruiter('Acme Staffing Solutions'), true);
  assert.equal(isRecruiter('Stripe'), false);
});

test('Greenhouse and Lever connectors (recorded shapes)', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string) => {
    const body = String(u).includes('greenhouse')
      ? { jobs: [{ id: 1, title: 'Backend Engineer', absolute_url: 'https://boards.greenhouse.io/acme/jobs/1', location: { name: 'Remote - US' }, first_published: '2026-11-01T00:00:00Z', content: '&lt;p&gt;Build things&lt;/p&gt;', departments: [{ name: 'Engineering' }] }] }
      : [{ id: 'abc', text: 'Designer', hostedUrl: 'https://jobs.lever.co/acme/abc', categories: { location: 'London', commitment: 'Full-time', team: 'Design' }, workplaceType: 'hybrid', createdAt: 1767225600000, descriptionPlain: 'Design', salaryRange: { currency: 'GBP', min: 50000, max: 60000, interval: 'per-year-salary' } }];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const g = await employerJobs({ ats: 'greenhouse', slug: 'acme', name: 'Acme' });
    assert.deepEqual([g[0].id, g[0].title, g[0].workplace, g[0].company, g[0].tags.includes('direct')], ['greenhouse:acme:1', 'Backend Engineer', 'remote', 'Acme', true]);
    const l = await employerJobs({ ats: 'lever', slug: 'acme', name: 'Acme' });
    assert.deepEqual([l[0].title, l[0].workplace, l[0].type, l[0].salary.startsWith('GBP 50000')], ['Designer', 'hybrid', 'Full-time', true]);
  } finally { globalThis.fetch = real; }
});

test('multi-word titles match with synonyms, loose matches drop out', async () => {
  const { titleScore, placeScore } = await import('../src/main/ats');
  assert.equal(titleScore('Senior Systems Administrator', 'System Admin'), 1);
  assert.equal(titleScore('Linux Sysadmin', 'system admin'), 1);
  assert.equal(titleScore('IT System Admin (Windows)', 'system admin'), 1);
  assert.ok(titleScore('Atlassian Administrator', 'System Admin') === 0.5);
  assert.equal(titleScore('Staff Software Engineer (SRE)', 'System Admin'), 0);
  assert.equal(titleScore('Remote Office Assistant', 'System Admin'), 0);
  assert.equal(titleScore('Full-Stack Developer', 'fullstack dev'), 1);
  assert.equal(placeScore('Gujranwala, Punjab, Pakistan', 'Gujranwala', 'Pakistan'), 2);
  assert.equal(placeScore('Lahore, Pakistan', 'Gujranwala', 'Pakistan'), 1);
  assert.equal(placeScore('Anywhere', 'Gujranwala', 'Pakistan'), 0.5);
});

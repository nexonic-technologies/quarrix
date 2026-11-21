import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, nameFromDomain, GENERIC_TITLE } from '../src/main/sources/web';
import { isQuotaError, alternates, chain, rankFree } from '../src/main/ai';
import { JOB_TITLES } from '../src/shared/jobtitles';

test('web results named after the page get the business name', () => {
  assert.equal(clean('Contact us | Moorfields Eye Hospital Dubai', 'moorfields.ae'), 'Moorfields Eye Hospital Dubai');
  assert.equal(clean('Contact Us', 'moorfields-dubai.ae'), 'Moorfields Dubai');
  assert.equal(clean('About Us - Smile Dental', 'smile.ae'), 'Smile Dental');
  assert.equal(clean('Home - Bright Clinic', 'x.ae'), 'Bright Clinic');
  assert.equal(nameFromDomain('www.al-noor_hospital.com'), 'Al Noor Hospital');
  assert.ok(GENERIC_TITLE.test('contact us') && !GENERIC_TITLE.test('Contact Dental Care'));
});

test('quota, rate limit and billing errors move to the next model', () => {
  assert.ok(isQuotaError(Object.assign(new Error('x'), { status: 429 })));
  assert.ok(isQuotaError(Object.assign(new Error('Insufficient credits'), { status: 402 })));
  assert.ok(isQuotaError(new Error('Rate limit exceeded: free-models-per-day')));
  assert.ok(isQuotaError(new Error('RESOURCE_EXHAUSTED: quota')));
  assert.ok(!isQuotaError(Object.assign(new Error('Invalid API key'), { status: 401 })));
  assert.ok(!isQuotaError(Object.assign(new Error('bad request'), { status: 400 })));
});

test('alternate models per provider and backup keys in order', () => {
  const ids = ['openai/gpt-5', 'meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free', 'x/y:free'];
  assert.deepEqual(alternates('openrouter', ids, 'deepseek/deepseek-chat-v3-0324:free'), ['meta-llama/llama-3.3-70b-instruct:free', 'x/y:free']);
  assert.deepEqual(rankFree(ids)[0], 'deepseek/deepseek-chat-v3-0324:free');
  assert.deepEqual(alternates('gemini', ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-image', 'text-embedding-004'], 'gemini-2.5-pro'), ['gemini-2.5-flash']);
  assert.deepEqual(alternates('openai', ['gpt-5'], ''), []);
  const c = chain({ provider: 'openrouter', apiKey: 'k1', model: '', baseUrl: '' }, { groq: 'g', openrouter: 'k1', gemini: '', ollama: 'x', custom: 'c' });
  assert.deepEqual(c.map((a) => a.provider), ['openrouter', 'groq']);
  assert.deepEqual(chain({ provider: 'none', apiKey: '', model: '', baseUrl: '' }, {}), []);
});

test('job title picker has unique titles', () => {
  const names = JOB_TITLES.map((t) => t.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length > 150);
});

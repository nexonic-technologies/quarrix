import { useState } from 'react';
import { call } from '../api';
import { toast } from '../App';
import { EMPTY_STUDIO, reviewResume, interviewTopics, dueItems, type StudioNotes } from '../../../shared/application-studio';

type Saved = { id: string; title: string; status?: string; studio?: StudioNotes };
export function ApplicationOverview({ jobs, onOpen }: { jobs: Saved[]; onOpen: (id: string) => void }) {
  const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const active = jobs.filter(j => !['Rejected', 'Withdrawn', 'Offer', 'Accepted'].includes(j.status ?? ''));
  const due = dueItems(active, today);
  return <section className="panel panel-pad" style={{ marginBottom: 12 }}><b>Application planner</b><p className="muted small">Due today or earlier</p>
    {!due.length ? <p className="muted small">No due application tasks.</p> : due.map(x => <button key={`${x.id}:${x.kind}`} className="btn ghost" onClick={() => onOpen(x.id)}>{x.day} · {x.kind === 'deadline' ? 'Application deadline' : x.kind === 'interview' ? 'Interview date' : 'Follow-up date'} · <span translate="no">{x.title}</span></button>)}
  </section>;
}

export function ApplicationStudio({ job, cv, posting, saved, onSave, onUpdated }: { job: Saved; cv?: { text?: string; profile: { skills: string[] } } | null; posting: string; saved: boolean; onSave: () => void; onUpdated: () => Promise<void> }) {
  const [form, setForm] = useState<StudioNotes>({ ...EMPTY_STUDIO, ...job.studio });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof StudioNotes, value: string) => setForm(f => ({ ...f, [key]: value }));
  const review = cv?.text ? reviewResume(cv.text, cv.profile.skills, posting) : null;
  const topics = interviewTopics(cv?.profile.skills ?? [], posting);
  const save = async () => { setBusy(true); try { await call('studio:save', job.id, form); await onUpdated(); toast.push('Application studio saved'); } catch (e: any) { toast.push(e.message, true); } finally { setBusy(false); } };
  return <section className="panel panel-pad" data-application-studio style={{ marginBottom: 12 }}>
    <h3>Application Studio</h3>
    <details><summary>Resume review</summary>{review ? <><p className="muted small">Text-based checks only. Missing evidence is not an ATS verdict.</p><p>{review.words} · <span>Words</span></p><p><b>Recognised sections:</b> <span translate="no">{review.sections.join(', ') || '—'}</span></p><p><b>Headings to review:</b> <span translate="no">{review.missing.join(', ') || '—'}</span></p><p><b>Email detected:</b> {review.emailPresent ? 'Yes' : 'Not found'} · <b>Phone detected:</b> {review.phonePresent ? 'Yes' : 'Not found'}</p><p><b>Skills mentioned in this posting:</b> <span translate="no">{review.matchedSkills.join(', ') || '—'}</span></p><p><b>Profile skills not mentioned:</b> <span translate="no">{review.unmentionedSkills.join(', ') || '—'}</span></p></> : <p>Upload a CV to review its extracted text.</p>}</details>
    <details><summary>Interview preparation</summary><p className="muted small">Practice with your own examples. These are prompts, not questions confirmed by the employer.</p><ul><li>Describe a relevant achievement and your role in it.</li><li>Describe a challenge, your actions, and the outcome.</li><li>Explain why this role fits your goals.</li><li>Prepare questions about responsibilities and expectations.</li></ul>{topics.length > 0 && <p><b>Topics from the posting:</b> <span translate="no">{topics.join(', ')}</span></p>}<label>STAR practice notes<textarea className="input" rows={4} value={form.practice} maxLength={20000} disabled={!saved || busy} onChange={e => set('practice', e.target.value)} placeholder="Situation, task, action, result" /></label></details>
    <details open><summary>Application plan</summary><p className="muted small">Dates and notes stay on this device. You decide when to apply or follow up.</p><div className="row" style={{ flexWrap: 'wrap' }}>{([['deadline','Application deadline'],['interview','Interview date'],['followUp','Follow-up date']] as const).map(([key, label]) => <label key={key} className="grow">{label}<input className="input" type="date" value={form[key]} disabled={!saved || busy} onChange={e => set(key, e.target.value)} /></label>)}</div><label>Next action<input className="input" value={form.nextAction} maxLength={500} disabled={!saved || busy} onChange={e => set('nextAction', e.target.value)} /></label><label>Application notes<textarea className="input" rows={3} value={form.notes} maxLength={20000} disabled={!saved || busy} onChange={e => set('notes', e.target.value)} /></label></details>
    <details><summary>Document drafts</summary><p className="muted small">Keep your own resume and cover letter drafts for this application. Review facts before sending.</p><label>Resume draft<textarea className="input" rows={5} value={form.resumeDraft} maxLength={50000} disabled={!saved || busy} onChange={e => set('resumeDraft', e.target.value)} /></label><button className="btn small" disabled={!form.resumeDraft.trim()} onClick={async () => { try { await call('jobs:saveDoc', form.resumeDraft, `Resume - ${job.title}`); } catch (e: any) { toast.push(e.message, true); } }}>Save as Word</button><label>Cover letter draft<textarea className="input" rows={5} value={form.letterDraft} maxLength={50000} disabled={!saved || busy} onChange={e => set('letterDraft', e.target.value)} /></label><button className="btn small" disabled={!form.letterDraft.trim()} onClick={async () => { try { await call('jobs:saveDoc', form.letterDraft, `Cover letter - ${job.title}`); } catch (e: any) { toast.push(e.message, true); } }}>Save as Word</button></details>
    <div className="row" style={{ marginTop: 10 }}>{saved ? <button className="btn primary" disabled={busy} onClick={save}>Save studio</button> : <button className="btn primary" onClick={onSave}>Save application to edit</button>}</div>
  </section>;
}

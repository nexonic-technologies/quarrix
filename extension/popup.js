// Sends only the current tab's address and title to Quarrix's local API, after a click.
const $ = (id) => document.getElementById(id);
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  $('u').textContent = tab?.url ?? '';
  $('go').onclick = async () => {
    const { port = 47811, token = '' } = await chrome.storage.local.get(['port', 'token']);
    if (!token) { $('s').textContent = 'Paste your capture token in Settings first.'; return; }
    $('s').textContent = 'Saving…';
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: tab.url, title: tab.title }) });
      const j = await r.json();
      $('s').textContent = j.error ?? (j.created ? 'Saved. Quarrix is checking the website now.' : 'Already in Quarrix.');
    } catch { $('s').textContent = 'Quarrix is not open, or the local API is off (Settings → Connections).'; }
  };
});

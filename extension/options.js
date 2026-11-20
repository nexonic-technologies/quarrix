const $ = (id) => document.getElementById(id);
chrome.storage.local.get(['port', 'token']).then(({ port = 47811, token = '' }) => { $('p').value = port; $('t').value = token; });
$('s').onclick = async () => { await chrome.storage.local.set({ token: $('t').value.trim(), port: Number($('p').value) || 47811 }); $('m').textContent = 'Saved'; };

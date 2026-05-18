import { el, clear } from './dom.js';
import { parseRepoUrl, fetchRepo, DEFAULT_MAX_FILES } from './git-fetch.js';

const LS_TOKEN_KEY = 'codemap.gh.token';

export function openGitModal(onLoaded) {
  const existing = document.getElementById('git-modal');
  if (existing) existing.remove();

  const state = { busy: false };

  const urlInput = el('input', {
    cls: 'gm-input',
    type: 'text',
    placeholder: 'github.com/owner/repo  or  gitlab.com/group/repo',
    attrs: { autocomplete: 'off', spellcheck: 'false' },
  });
  const tokenInput = el('input', {
    cls: 'gm-input',
    type: 'password',
    placeholder: 'Optional access token (raises GitHub limit to 5000/hr)',
    attrs: { autocomplete: 'off', spellcheck: 'false' },
    value: sessionStorage.getItem(LS_TOKEN_KEY) || '',
  });
  const status = el('div', { cls: 'gm-status', text: ' ' });
  const loadBtn = el('button', { cls: 'gm-load', type: 'button', text: 'Load' });
  const cancelBtn = el('button', { cls: 'gm-cancel', type: 'button', text: 'Cancel' });

  function close() { modal.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) {
    if (state.busy) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter' && document.activeElement !== loadBtn) { e.preventDefault(); start(); }
  }

  function setStatus(text, tone = '') {
    status.textContent = text || ' ';
    status.className = 'gm-status' + (tone ? ' ' + tone : '');
  }

  async function start() {
    if (state.busy) return;
    const spec = parseRepoUrl(urlInput.value);
    if (!spec) { setStatus('Enter a github.com/<owner>/<repo> or gitlab.com/... URL.', 'err'); return; }
    const token = tokenInput.value.trim();
    if (token) sessionStorage.setItem(LS_TOKEN_KEY, token);
    state.busy = true;
    loadBtn.disabled = true; cancelBtn.disabled = true;
    urlInput.disabled = true; tokenInput.disabled = true;
    setStatus(`Resolving ${spec.host}.com/${spec.owner}/${spec.repo}…`);
    try {
      const result = await fetchRepo(spec, {
        token,
        maxFiles: DEFAULT_MAX_FILES,
        onProgress: p => {
          if (p.phase === 'meta')  setStatus('Resolving default branch…');
          if (p.phase === 'tree')  setStatus(`Fetching file tree on ${p.ref}…`);
          if (p.phase === 'files') setStatus(`Downloading files… ${p.done}/${p.total}`);
        },
      });
      setStatus(`Parsed ${result.files.length} files${result.meta.truncated ? ` (capped at ${DEFAULT_MAX_FILES} of ${result.meta.totalBlobs})` : ''}.`, 'ok');
      close();
      onLoaded(result);
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), 'err');
      state.busy = false;
      loadBtn.disabled = false; cancelBtn.disabled = false;
      urlInput.disabled = false; tokenInput.disabled = false;
    }
  }

  loadBtn.addEventListener('click', start);
  cancelBtn.addEventListener('click', () => { if (!state.busy) close(); });

  const card = el('div', { cls: 'gm-card' }, [
    el('div', { cls: 'gm-title', text: 'Load repo from URL' }),
    el('div', { cls: 'gm-hint',  text: 'Fetches the default branch (or the branch in the URL) directly from GitHub / GitLab. Stays in your browser.' }),
    el('label', { cls: 'gm-label', text: 'Repository URL' }),
    urlInput,
    el('label', { cls: 'gm-label', text: 'Access token (optional)' }),
    tokenInput,
    status,
    el('div', { cls: 'gm-actions' }, [cancelBtn, loadBtn]),
  ]);
  const modal = el('div', { cls: 'gm-overlay', attrs: { id: 'git-modal' }, on: {
    click: e => { if (e.target === modal && !state.busy) close(); },
  } }, [card]);

  document.body.appendChild(modal);
  document.addEventListener('keydown', onKey);
  urlInput.focus();
}

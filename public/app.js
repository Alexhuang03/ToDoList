/* ===== API LAYER ===== */
const API = {
  token() { return localStorage.getItem('tdl_token'); },
  headers() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token()}` }; },
  async req(method, path, body) {
    const res = await fetch('/api' + path, { method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  },
  get(path) { return this.req('GET', path); },
  post(path, body) { return this.req('POST', path, body); },
  put(path, body) { return this.req('PUT', path, body); },
  patch(path, body) { return this.req('PATCH', path, body); },
  del(path, body) { return this.req('DELETE', path, body); },
};

/* ===== STATE ===== */
let currentUser = null;
let currentFile = null;
let pollInterval = null;
const expandedMissions = new Set();
let applyWallpaper = null;
let applyAccent = null;

/* ===== HELPERS ===== */
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function dateBadgeEmoji(cls) {
  if (cls === 'ok') return '😎';
  if (cls === 'warning') return '🤔';
  if (cls === 'urgent' || cls === 'overdue') return '🫪';
  return '📅';
}
function dateBadgeClass(d, done) {
  if (!d) return '';
  if (done) return 'done';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const deadline = new Date(d); deadline.setHours(0, 0, 0, 0);
  const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff < 3) return 'urgent';
  if (diff < 7) return 'warning';
  return 'ok';
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`#${id}`).classList.add('active');
}

function setLoading(btnId, loading) {
  const btn = $(`#${btnId}`);
  if (!btn) return;
  btn.disabled = loading;
  btn.style.opacity = loading ? '0.6' : '1';
}

/* ===== AUTH ===== */
$('#show-register').addEventListener('click', e => { e.preventDefault(); $('#login-form').classList.add('hidden'); $('#register-form').classList.remove('hidden'); });
$('#show-login').addEventListener('click', e => { e.preventDefault(); $('#register-form').classList.add('hidden'); $('#forgot-form').classList.add('hidden'); $('#login-form').classList.remove('hidden'); });
$('#show-forgot').addEventListener('click', e => { e.preventDefault(); $('#login-form').classList.add('hidden'); $('#register-form').classList.add('hidden'); $('#forgot-form').classList.remove('hidden'); $('#forgot-email').focus(); });
$('#forgot-back').addEventListener('click', e => { e.preventDefault(); $('#forgot-form').classList.add('hidden'); $('#login-form').classList.remove('hidden'); });

$('#register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#register-name').value.trim();
  const email = $('#register-email').value.trim().toLowerCase();
  const password = $('#register-password').value;
  $('#register-error').textContent = '';
  setLoading('register-btn', true);
  try {
    const data = await API.post('/auth/register', { name, email, password });
    localStorage.setItem('tdl_token', data.token);
    currentUser = data.user;
    enterApp();
  } catch (err) {
    $('#register-error').textContent = err.message;
  } finally {
    setLoading('register-btn', false);
  }
});

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#login-email').value.trim().toLowerCase();
  const password = $('#login-password').value;
  $('#login-error').textContent = '';
  setLoading('login-btn', true);
  try {
    const data = await API.post('/auth/login', { email, password });
    localStorage.setItem('tdl_token', data.token);
    currentUser = data.user;
    enterApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  } finally {
    setLoading('login-btn', false);
  }
});

$('#logout-btn').addEventListener('click', () => {
  localStorage.removeItem('tdl_token');
  currentUser = null;
  currentFile = null;
  stopPolling();
  // Reset personalization settings back to default on logout
  if (applyWallpaper) applyWallpaper({ type: 'default' }, false);
  if (applyAccent) applyAccent('#6C5CE7', false);
  applyTheme(localStorage.getItem('tdl_theme') || 'dark', false);
  showScreen('auth-screen');
});

function enterApp() {
  $('#user-greeting').textContent = `Bonjour, ${currentUser.name}`;

  // Apply theme settings for this user (cached locally or from DB)
  let userTheme = localStorage.getItem('tdl_theme_' + currentUser._id);
  if (!userTheme && currentUser.theme) {
    userTheme = currentUser.theme;
  }
  applyTheme(userTheme || 'dark', false);

  // Apply personalized settings for this user (cached locally per user, or from DB)
  if (applyWallpaper) {
    let wp = localStorage.getItem('tdl_wallpaper_' + currentUser._id);
    if (!wp && currentUser.wallpaper) {
      wp = currentUser.wallpaper;
    }
    if (wp) {
      try {
        applyWallpaper(JSON.parse(wp), false);
      } catch (_) {
        applyWallpaper({ type: 'default' }, false);
      }
    } else {
      applyWallpaper({ type: 'default' }, false);
    }
  }

  if (applyAccent) {
    let acc = localStorage.getItem('tdl_accent_' + currentUser._id);
    if (!acc && currentUser.accent) {
      acc = currentUser.accent;
    }
    if (acc) {
      applyAccent(acc, false);
    } else {
      applyAccent('#6C5CE7', false);
    }
  }

  renderHome();
  showScreen('home-screen');
}

/* ===== FORGOT PASSWORD ===== */
$('#forgot-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#forgot-email').value.trim();
  const msgEl = $('#forgot-msg');
  msgEl.textContent = '';
  msgEl.style.color = '';
  setLoading('forgot-btn', true);
  try {
    const data = await API.post('/auth/forgot-password', { email });
    msgEl.style.color = 'var(--accent-light)';
    msgEl.textContent = '✓ ' + data.message + ' Vérifiez votre boîte mail (et les spams).';
    $('#forgot-email').value = '';
  } catch (err) {
    msgEl.textContent = err.message;
  } finally {
    setLoading('forgot-btn', false);
  }
});

$('#reset-form').addEventListener('submit', async e => {
  e.preventDefault();
  const password = $('#reset-password').value;
  const confirm = $('#reset-confirm').value;
  const msgEl = $('#reset-msg');
  msgEl.textContent = '';
  msgEl.style.color = '';
  if (password !== confirm) { msgEl.textContent = 'Les mots de passe ne correspondent pas.'; return; }
  const token = new URLSearchParams(window.location.search).get('reset_token');
  if (!token) { msgEl.textContent = 'Token manquant. Recommencez la procédure.'; return; }
  setLoading('reset-btn', true);
  try {
    const data = await API.post(`/auth/reset-password/${token}`, { password });
    msgEl.style.color = 'var(--accent-light)';
    msgEl.textContent = '✓ ' + data.message;
    // Effacer le token de l’URL et rediriger vers login après 2s
    setTimeout(() => {
      window.history.replaceState({}, '', '/');
      $('#reset-form').classList.add('hidden');
      $('#login-form').classList.remove('hidden');
      $('#reset-password').value = ''; $('#reset-confirm').value = '';
    }, 2000);
  } catch (err) {
    msgEl.textContent = err.message;
  } finally {
    setLoading('reset-btn', false);
  }
});

/* ===== AUTO-LOGIN ===== */
(async function init() {
  // Détection du token de réinitialisation dans l'URL
  const resetToken = new URLSearchParams(window.location.search).get('reset_token');
  if (resetToken) {
    showScreen('auth-screen');
    $('#login-form').classList.add('hidden');
    $('#reset-form').classList.remove('hidden');
    return;
  }
  if (!API.token()) { showScreen('auth-screen'); return; }
  try {
    const data = await API.get('/auth/me');
    currentUser = data.user;
    enterApp();
  } catch {
    localStorage.removeItem('tdl_token');
    showScreen('auth-screen');
  }
})();

/* ===== HOME ===== */
async function renderHome() {
  stopPolling();
  const grid = $('#files-grid');
  grid.innerHTML = '<div style="color:var(--text-dim);padding:2rem;text-align:center;">Chargement...</div>';
  try {
    const { files } = await API.get('/files');
    const { trash } = await API.get('/trash');
    let html = `<div class="file-card trash-card" data-action="trash">
      <div class="file-card-name">🗑️ Corbeille</div>
      <div class="file-card-meta">${trash.length} élément(s)</div>
    </div>`;
    files.forEach(f => {
      const total = countTasks(f), done = countDone(f);
      const isOwner = f.ownerId._id === currentUser._id || f.ownerId === currentUser._id;
      const collab = f.sharedWith && f.sharedWith.length > 0 ? `👥 ${f.sharedWith.length + 1}` : '';
      html += `<div class="file-card" data-id="${f._id}">
        <div class="file-card-actions">
          ${isOwner ? `<button class="icon-btn" data-edit="${f._id}" title="Modifier"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>` : ''}
          ${isOwner ? `<button class="icon-btn" data-share="${f._id}" title="Partager"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>` : ''}
          ${isOwner ? `<button class="icon-btn danger" data-delete="${f._id}" title="Supprimer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>` : ''}
        </div>
        <div class="file-card-name">${f.emoji ? f.emoji + ' ' : ''}${esc(f.name)}${collab ? ` <span style="font-size:0.75rem;opacity:0.7;">${collab}</span>` : ''}</div>
        <div class="file-card-meta">${total} mission(s) · ${done} terminée(s)</div>
      </div>`;
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.file-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-edit]')) { openEditModal(e.target.closest('[data-edit]').dataset.edit, files); return; }
        if (e.target.closest('[data-share]')) { openShareModal(e.target.closest('[data-share]').dataset.share, files); return; }
        if (e.target.closest('[data-delete]')) { deleteFile(e.target.closest('[data-delete]').dataset.delete); return; }
        if (card.dataset.action === 'trash') { openTrash(); return; }
        if (card.dataset.id) {
          const f = files.find(x => x._id === card.dataset.id);
          if (f) openFile(f);
        }
      });
    });
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--text-dim)">${err.message}</p>`;
  }
}

function countTasks(f) { return (f.sections || []).reduce((s, sec) => s + sec.missions.length, 0); }
function countDone(f) { return (f.sections || []).reduce((s, sec) => s + sec.missions.filter(m => m.done).length, 0); }

/* ===== NEW FILE MODAL ===== */
$('#add-file-btn').addEventListener('click', () => {
  $('#modal-overlay').classList.add('active');
  $('#new-file-name').value = '';
  // Reset emoji selection
  document.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
  document.querySelector('.emoji-opt[data-emoji=""]').classList.add('selected');
  setTimeout(() => $('#new-file-name').focus(), 100);
});

// Emoji picker selection
document.querySelectorAll('.emoji-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});
$('#modal-cancel').addEventListener('click', () => $('#modal-overlay').classList.remove('active'));
$('#modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) $('#modal-overlay').classList.remove('active'); });

$('#modal-confirm').addEventListener('click', async () => {
  const name = $('#new-file-name').value.trim();
  if (!name) return;
  const selectedEmoji = document.querySelector('.emoji-opt.selected');
  const emoji = selectedEmoji ? selectedEmoji.dataset.emoji : '';
  try {
    await API.post('/files', { name, emoji });
    $('#modal-overlay').classList.remove('active');
    toast('Fichier créé !');
    renderHome();
  } catch (err) { toast(err.message); }
});
$('#new-file-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#modal-confirm').click(); } });

/* ===== EDIT FILE MODAL ===== */
let editFileId = null;

function openEditModal(fid, files) {
  const f = files.find(x => x._id === fid);
  if (!f) return;
  editFileId = fid;
  $('#edit-file-name').value = f.name;
  // Pre-select current emoji
  document.querySelectorAll('.edit-emoji-opt').forEach(b => {
    b.classList.toggle('selected', b.dataset.emoji === (f.emoji || ''));
  });
  $('#edit-modal-overlay').classList.add('active');
  setTimeout(() => $('#edit-file-name').focus(), 100);
}

document.querySelectorAll('.edit-emoji-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.edit-emoji-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

$('#edit-modal-cancel').addEventListener('click', () => $('#edit-modal-overlay').classList.remove('active'));
$('#edit-modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) $('#edit-modal-overlay').classList.remove('active'); });

$('#edit-modal-confirm').addEventListener('click', async () => {
  const name = $('#edit-file-name').value.trim();
  if (!name || !editFileId) return;
  const sel = document.querySelector('.edit-emoji-opt.selected');
  const emoji = sel ? sel.dataset.emoji : '';
  try {
    await API.put(`/files/${editFileId}`, { name, emoji });
    $('#edit-modal-overlay').classList.remove('active');
    toast('Fichier modifié !');
    renderHome();
  } catch (err) { toast(err.message); }
});
$('#edit-file-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#edit-modal-confirm').click(); } });

/* ===== DELETE FILE ===== */
async function deleteFile(id) {
  try {
    await API.del(`/files/${id}`);
    toast('Fichier supprimé');
    renderHome();
  } catch (err) { toast(err.message); }
}

/* ===== SHARE MODAL ===== */
let shareFileId = null;
function openShareModal(fid, files) {
  shareFileId = fid;
  const f = files.find(x => x._id === fid);
  if (!f) return;
  $('#share-file-name').textContent = `Fichier : ${f.name}`;
  $('#share-email').value = '';
  renderSharedUsers(f);
  $('#share-overlay').classList.add('active');
}
$('#share-close').addEventListener('click', () => $('#share-overlay').classList.remove('active'));
$('#share-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) $('#share-overlay').classList.remove('active'); });

$('#share-add-btn').addEventListener('click', async () => {
  const email = $('#share-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    const { file } = await API.post(`/files/${shareFileId}/share`, { email });
    $('#share-email').value = '';
    renderSharedUsers(file);
    toast(`Accès accordé à ${email}`);
    renderHome();
  } catch (err) { toast(err.message); }
});

function renderSharedUsers(f) {
  const list = $('#shared-users-list');
  const shared = f.sharedWith || [];
  if (shared.length === 0) { list.innerHTML = '<p style="color:var(--text-dim);font-size:0.82rem;">Aucun collaborateur pour le moment.</p>'; return; }
  list.innerHTML = shared.map(u => {
    const uid = u._id || u;
    const label = u.name ? `${u.name} (${u.email})` : u.email || uid;
    return `<div class="shared-user"><span class="shared-user-email">${esc(label)}</span><button class="icon-btn danger" data-remove-share="${uid}" title="Retirer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`;
  }).join('');
  list.querySelectorAll('[data-remove-share]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const { file } = await API.del(`/files/${shareFileId}/share/${btn.dataset.removeShare}`);
        renderSharedUsers(file);
        toast('Collaborateur retiré');
      } catch (err) { toast(err.message); }
    });
  });
}

/* ===== TRASH ===== */
async function openTrash() {
  await renderTrash();
  showScreen('trash-screen');
}
$('#trash-back-btn').addEventListener('click', () => { showScreen('home-screen'); renderHome(); });

$('#empty-trash-btn').addEventListener('click', async () => {
  try {
    await API.del('/trash');
    toast('Corbeille vidée');
    renderTrash();
  } catch (err) { toast(err.message); }
});

async function renderTrash() {
  const container = $('#trash-content');
  const emptyEl = $('#trash-empty-state');
  try {
    const { trash } = await API.get('/trash');
    if (trash.length === 0) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
    emptyEl.classList.add('hidden');
    container.innerHTML = trash.map((item, i) => {
      let label, origin;
      if (item.type === 'file') {
        label = `📁 ${esc(item.data.name)}`;
        origin = 'Fichier supprimé';
      } else if (item.type === 'subtask') {
        label = `↳ ${esc(item.data.text)}`;
        origin = `Sous-mission de : ${esc(item.origin || '')}`;
      } else {
        label = `✓ ${esc(item.data.text)}`;
        origin = `De : ${esc(item.origin || '')}`;
      }
      return `<div class="trash-item"><div class="trash-item-info"><span class="trash-item-name">${label}</span><span class="trash-item-origin">${origin}</span></div><button class="btn-restore" data-restore="${i}">Restaurer</button></div>`;
    }).join('');
    container.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await API.post(`/trash/restore/${btn.dataset.restore}`);
          toast('Élément restauré');
          renderTrash();
        } catch (err) { toast(err.message); }
      });
    });
  } catch (err) { container.innerHTML = `<p style="color:var(--text-dim)">${err.message}</p>`; }
}

/* ===== FILE DETAIL ===== */
function openFile(f) {
  currentFile = f;
  $('#file-title').textContent = (f.emoji ? f.emoji + ' ' : '') + f.name;
  $('#quick-entry').value = '';
  renderSections();
  showScreen('file-screen');
  setTimeout(() => $('#quick-entry').focus(), 100);
  startPolling();
}

function startTitleEdit() {
  const wrapper = $('#file-title-wrapper');
  if (!wrapper || !currentFile) return;
  // Already editing?
  if (wrapper.querySelector('.file-title-input')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentFile.name;
  input.className = 'file-title-input';
  wrapper.innerHTML = '';
  wrapper.appendChild(input);
  input.focus();
  input.select();

  async function saveTitle() {
    const newName = input.value.trim();
    if (newName && newName !== currentFile.name) {
      try {
        const { file } = await API.put(`/files/${currentFile._id}`, { name: newName });
        currentFile = file;
        toast('Titre modifié !');
      } catch (err) { toast(err.message); }
    }
    wrapper.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.id = 'file-title';
    h2.className = 'file-title-header';
    h2.title = 'Cliquer pour renommer';
    h2.textContent = (currentFile.emoji ? currentFile.emoji + ' ' : '') + currentFile.name;
    wrapper.appendChild(h2);
  }
  input.addEventListener('blur', saveTitle);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = currentFile.name; input.blur(); }
  });
}

// Delegation : clic sur le wrapper du titre (fonctionne même après innerHTML reset)
$('#file-title-wrapper').addEventListener('click', e => {
  if (e.target.classList.contains('file-title-header')) startTitleEdit();
});


$('#back-btn').addEventListener('click', () => {
  stopPolling();
  currentFile = null;
  renderHome();
  showScreen('home-screen');
});

async function saveFile() {
  try {
    const { file } = await API.put(`/files/${currentFile._id}`, { sections: currentFile.sections });
    currentFile = file;
  } catch (err) { toast(err.message); }
}

/* ===== POLLING (collaboration) ===== */
function startPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    if (!currentFile) return;
    try {
      const { file } = await API.get(`/files/${currentFile._id}`);
      currentFile = file;
      renderSections();
    } catch {}
  }, 5000);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

/* ===== QUICK ENTRY — SECTION AUTOCOMPLETE ===== */
(function () {
  const input    = $('#quick-entry');
  const ghost    = $('#quick-entry-ghost');
  const tabHint  = $('#tab-hint');
  let currentSuggestion = ''; // full section name to suggest
  let hashStart = -1;          // index of '#' in input value

  function getSections() {
    return currentFile ? currentFile.sections.map(s => s.name) : [];
  }

  function findMatch(typed) {
    // typed = text after '#', case-insensitive prefix match
    if (!typed) return '';
    const lower = typed.toLowerCase();
    return getSections().find(s => s.toLowerCase().startsWith(lower) && s.toLowerCase() !== lower) || '';
  }

  function updateGhost() {
    const val = input.value;
    const hashIdx = val.lastIndexOf('#');

    if (hashIdx === -1) {
      // No '#' → clear ghost
      ghost.innerHTML = '';
      tabHint.style.display = 'none';
      currentSuggestion = '';
      hashStart = -1;
      return;
    }

    hashStart = hashIdx;
    const afterHash = val.slice(hashIdx + 1); // text typed after '#'
    // Only suggest if afterHash has no spaces (still completing the tag)
    if (/\s/.test(afterHash)) {
      ghost.innerHTML = '';
      tabHint.style.display = 'none';
      currentSuggestion = '';
      return;
    }

    const match = findMatch(afterHash);
    if (!match) {
      ghost.innerHTML = '';
      tabHint.style.display = 'none';
      currentSuggestion = '';
      return;
    }

    currentSuggestion = match;
    const completion = match.slice(afterHash.length); // remaining chars to complete

    // Build ghost: transparent copy of typed text + coloured completion
    const typedSpan    = `<span class="ghost-typed">${esc(val)}</span>`;
    const suggSpan     = `<span class="ghost-suggestion">${esc(completion)}</span>`;
    ghost.innerHTML    = typedSpan + suggSpan;
    tabHint.style.display = 'block';
  }

  function acceptSuggestion() {
    if (!currentSuggestion || hashStart === -1) return;
    const val       = input.value;
    const afterHash = val.slice(hashStart + 1);
    const completion = currentSuggestion.slice(afterHash.length);
    input.value = val + completion;
    updateGhost();
    input.focus();
  }

  input.addEventListener('input', updateGhost);

  input.addEventListener('keydown', async e => {
    // Tab → accept suggestion
    if (e.key === 'Tab') {
      if (currentSuggestion) {
        e.preventDefault();
        acceptSuggestion();
      }
      return;
    }

    // Escape → clear suggestion
    if (e.key === 'Escape') {
      ghost.innerHTML = '';
      tabHint.style.display = 'none';
      currentSuggestion = '';
      return;
    }

    // Enter → add mission
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (!val) return;
    const hashMatch   = val.match(/#(\S+)/);
    const sectionName = hashMatch ? hashMatch[1] : 'Général';
    const missionText = val.replace(/#\S+/g, '').trim();
    if (!missionText) return;
    let sec = currentFile.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase());
    if (!sec) { sec = { name: sectionName, missions: [] }; currentFile.sections.push(sec); }
    sec.missions.push({ id: uid(), text: missionText, done: false, subtasks: [] });
    e.target.value = '';
    ghost.innerHTML = '';
    tabHint.style.display = 'none';
    currentSuggestion = '';
    await saveFile();
    renderSections();
  });
})();

/* ===== RENDER SECTIONS ===== */
function renderSections() {
  if (!currentFile) return;
  const container = $('#sections-container');
  const emptyEl = $('#empty-state');
  const totalMissions = countTasks(currentFile);
  const doneMissions = countDone(currentFile);
  if (totalMissions === 0) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); } else { emptyEl.classList.add('hidden'); }
  const pct = totalMissions > 0 ? Math.round((doneMissions / totalMissions) * 100) : 0;
  $('#progress-fill').style.width = pct + '%';
  $('#progress-text').textContent = pct + '%';
  let html = '';
  currentFile.sections.forEach(sec => {
    const sorted = [...sec.missions].sort((a, b) => a.done - b.done);
    const doneCount = sec.missions.filter(m => m.done).length;
    html += `<div class="section"><div class="section-header"><span class="section-tag" data-secedit="${esc(sec.name)}" title="Cliquer pour renommer"># ${esc(sec.name)}</span><span class="section-count">${doneCount}/${sec.missions.length}</span></div>`;
    sorted.forEach(m => { html += renderMission(m, sec.name); });
    html += '</div>';
  });
  container.innerHTML = html;
  expandedMissions.forEach(mid => {
    const toggle = document.querySelector(`.subtask-toggle[data-toggle="${mid}"]`);
    const subList = document.querySelector(`.subtasks-list[data-parent="${mid}"]`);
    if (toggle) toggle.classList.add('open');
    if (subList) subList.classList.add('open');
  });
  bindMissionEvents();
}

function renderMission(m, secName) {
  const hasSubtasks = m.subtasks && m.subtasks.length > 0;
  const arrow = hasSubtasks ? `<button class="subtask-toggle" data-toggle="${m.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>` : '';
  
  const mClass = dateBadgeClass(m.dueDate, m.done);
  const dateBadge = m.done 
    ? `<span class="mission-date done"> Fait le ${formatDate(m.completedAt || new Date())}</span>`
    : (m.dueDate ? `<span class="mission-date ${mClass}">${dateBadgeEmoji(mClass)} ${formatDate(m.dueDate)}</span>` : '');
  const mDueDateStr = m.dueDate ? new Date(m.dueDate).toISOString().split('T')[0] : '';

  let sub = '';
  if (hasSubtasks) {
    const sortedSub = [...m.subtasks].sort((a, b) => {
      // Terminées en bas
      if (a.done !== b.done) return a.done - b.done;
      // Parmi les non-terminées : deadline la plus proche en premier
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    sub = `<div class="subtasks-list" data-parent="${m.id}">`;
    sortedSub.forEach(st => {
      const stClass = dateBadgeClass(st.dueDate, st.done);
      const stDateBadge = st.done
        ? `<span class="subtask-date done"> Fait le ${formatDate(st.completedAt || new Date())}</span>`
        : (st.dueDate ? `<span class="subtask-date ${stClass}">${dateBadgeEmoji(stClass)} ${formatDate(st.dueDate)}</span>` : '');
      sub += `<div class="subtask-item${st.done ? ' completed' : ''}" data-stid="${st.id}">
        <button class="subtask-check${st.done ? ' checked' : ''}" data-stcheck="${st.id}" data-mid="${m.id}"></button>
        <span class="subtask-text" data-stedit="${st.id}" data-mid="${m.id}">${esc(st.text)}</span>
        ${stDateBadge}
        <div class="subtask-actions">
          <button class="icon-btn" data-stdatepick="${st.id}" data-mid="${m.id}" data-maxdate="${mDueDateStr}" title="Date d'échéance"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
          <button class="icon-btn danger" data-stdel="${st.id}" data-mid="${m.id}" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        </div>
      </div>`;
    });
    sub += '</div>';
  }
  return `<div class="mission-item${m.done ? ' completed' : ''}" data-mid="${m.id}" data-sec="${esc(secName)}">
    <button class="mission-check${m.done ? ' checked' : ''}" data-check="${m.id}"></button>
    ${arrow}
    <span class="mission-text" data-edit="${m.id}">${esc(m.text)}</span>
    ${dateBadge}
    <div class="mission-actions">
      <button class="icon-btn" data-datepick="${m.id}" title="Date d'échéance"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
      <button class="icon-btn" data-addsub="${m.id}" title="Ajouter sous-mission"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button class="icon-btn danger" data-del="${m.id}" title="Supprimer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
    </div>
  </div>${sub}`;
}

/* ===== MISSION EVENTS ===== */
function bindMissionEvents() {
  // ── Inline rename section tag ──
  document.querySelectorAll('[data-secedit]').forEach(span => span.addEventListener('click', () => {
    const oldName = span.dataset.secedit;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'section-tag-input';
    input.value = oldName;
    // auto-size to content
    input.style.width = Math.max(oldName.length * 9, 60) + 'px';
    span.replaceWith(input);
    input.focus();
    input.select();

    let saved = false;
    const save = async () => {
      if (saved) return; saved = true;
      const newName = input.value.trim();
      if (newName && newName.toLowerCase() !== oldName.toLowerCase()) {
        // Check no other section has this name
        const conflict = currentFile.sections.find(s => s.name.toLowerCase() === newName.toLowerCase() && s.name !== oldName);
        if (conflict) { toast('Une section avec ce nom existe déjà.'); renderSections(); return; }
        currentFile.sections.forEach(s => { if (s.name === oldName) s.name = newName; });
        await saveFile();
        toast('Section renommée !');
      }
      renderSections();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { saved = true; renderSections(); }
    });
    // auto-resize as user types
    input.addEventListener('input', () => {
      input.style.width = Math.max(input.value.length * 9, 60) + 'px';
    });
  }));

  document.querySelectorAll('[data-check]').forEach(btn => btn.addEventListener('click', async () => {
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === btn.dataset.check);
      if (m) {
        m.done = !m.done;
        m.completedAt = m.done ? new Date() : null;
        // Cascader l'état à toutes les sous-missions
        if (m.subtasks && m.subtasks.length > 0) {
          m.subtasks.forEach(st => {
            st.done = m.done;
            st.completedAt = m.done ? new Date() : null;
          });
        }
      }
    });
    await saveFile(); renderSections();
  }));

  document.querySelectorAll('[data-edit]').forEach(span => span.addEventListener('click', () => {
    const mid = span.dataset.edit, current = span.textContent;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.value = current;
    span.replaceWith(input); input.focus();
    let saved = false;
    const save = async () => {
      if (saved) return; saved = true;
      const val = input.value.trim();
      if (val && val !== current) {
        currentFile.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m) m.text = val; });
        await saveFile();
      }
      renderSections();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { saved = true; renderSections(); } });
  }));

  document.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const mid = btn.dataset.del;
    currentFile.sections.forEach(s => {
      const idx = s.missions.findIndex(x => x.id === mid);
      if (idx !== -1) {
        const removed = s.missions.splice(idx, 1)[0];
        API.post('/trash', { type: 'mission', data: removed, fileId: currentFile._id, sectionName: s.name, origin: currentFile.name + ' / ' + s.name });
      }
    });
    currentFile.sections = currentFile.sections.filter(s => s.missions.length > 0);
    await saveFile(); toast('Mission supprimée'); renderSections();
  }));

  document.querySelectorAll('[data-addsub]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.addsub;
    const missionEl = btn.closest('.mission-item');
    let mission = null;
    currentFile.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m) mission = m; });
    if (!mission) return;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.placeholder = 'Nouvelle sous-mission...';
    input.style.marginLeft = '3.2rem'; input.style.marginTop = '0.3rem'; input.style.marginBottom = '0.3rem';
    missionEl.parentNode.insertBefore(input, missionEl.nextSibling);
    input.focus();
    let saved = false;
    const doAdd = async () => {
      if (saved) return; saved = true;
      const val = input.value.trim();
      if (val) {
        if (!mission.subtasks) mission.subtasks = [];
        mission.subtasks.push({ id: uid(), text: val, done: false });
        await saveFile();
      }
      renderSections();
    };
    input.addEventListener('blur', doAdd);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } if (e.key === 'Escape') { saved = true; renderSections(); } });
  }));

  document.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const mid = btn.dataset.toggle;
    if (expandedMissions.has(mid)) expandedMissions.delete(mid); else expandedMissions.add(mid);
    btn.classList.toggle('open');
    const subList = document.querySelector(`.subtasks-list[data-parent="${mid}"]`);
    if (subList) subList.classList.toggle('open');
  }));

  document.querySelectorAll('[data-stcheck]').forEach(btn => btn.addEventListener('click', async () => {
    const stid = btn.dataset.stcheck, mid = btn.dataset.mid;
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m && m.subtasks) {
        const st = m.subtasks.find(x => x.id === stid);
        if (st) {
          st.done = !st.done;
          st.completedAt = st.done ? new Date() : null;
        }
        if (m.subtasks.length > 0 && m.subtasks.every(x => x.done)) {
          m.done = true;
          m.completedAt = m.completedAt || new Date();
        }
        if (m.subtasks.some(x => !x.done)) {
          m.done = false;
          m.completedAt = null;
        }
      }
    });
    await saveFile(); renderSections();
  }));

  document.querySelectorAll('[data-stedit]').forEach(span => span.addEventListener('click', () => {
    const stid = span.dataset.stedit, mid = span.dataset.mid, current = span.textContent;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.value = current; input.style.fontSize = '0.85rem';
    span.replaceWith(input); input.focus();
    let saved = false;
    const save = async () => {
      if (saved) return; saved = true;
      const val = input.value.trim();
      if (val && val !== current) {
        currentFile.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m && m.subtasks) { const st = m.subtasks.find(x => x.id === stid); if (st) st.text = val; } });
        await saveFile();
      }
      renderSections();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { saved = true; renderSections(); } });
  }));

  document.querySelectorAll('[data-stdel]').forEach(btn => btn.addEventListener('click', async () => {
    const stid = btn.dataset.stdel, mid = btn.dataset.mid;
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m && m.subtasks) {
        const idx = m.subtasks.findIndex(x => x.id === stid);
        if (idx !== -1) {
          const removed = m.subtasks.splice(idx, 1)[0];
          API.post('/trash', {
            type: 'subtask',
            data: removed,
            fileId: currentFile._id,
            sectionName: s.name,
            parentMissionId: mid,
            origin: currentFile.name + ' / ' + s.name + ' / ' + m.text
          });
          if (m.subtasks.length > 0 && m.subtasks.every(x => x.done)) m.done = true;
        }
      }
    });
    await saveFile(); renderSections();
  }));

  // Date picker — mission principale
  document.querySelectorAll('[data-datepick]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const mid = btn.dataset.datepick;
    let currentVal = null;
    let minDate = null;
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m) {
        if (m.dueDate) currentVal = m.dueDate;
        // minDate = deadline la plus tardive des sous-missions
        if (m.subtasks) {
          m.subtasks.forEach(st => {
            if (st.dueDate) {
              if (!minDate || new Date(st.dueDate) > new Date(minDate)) minDate = st.dueDate;
            }
          });
        }
      }
    });
    openDatePicker(btn, { type: 'mission', mid, currentVal, maxDate: null, minDate });
  }));

  // Date picker — sous-mission
  document.querySelectorAll('[data-stdatepick]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const stid = btn.dataset.stdatepick;
    const mid = btn.dataset.mid;
    const maxDate = btn.dataset.maxdate || null;
    let currentVal = null;
    currentFile.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m && m.subtasks) { const st = m.subtasks.find(x => x.id === stid); if (st && st.dueDate) currentVal = st.dueDate; } });
    openDatePicker(btn, { type: 'subtask', mid, stid, currentVal, maxDate });
  }));
}

/* ===== CUSTOM DATE PICKER ===== */
let dpTarget = null;
let dpViewMonth = null;

function openDatePicker(anchorBtn, config) {
  closeDatePicker();
  dpTarget = config;
  dpViewMonth = config.currentVal
    ? new Date(new Date(config.currentVal).getFullYear(), new Date(config.currentVal).getMonth(), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const popup = document.createElement('div');
  popup.id = 'dp-popup';
  popup.className = 'dp-popup';
  document.body.appendChild(popup);
  renderDPContent(popup, config.currentVal);

  // Positionner sous le bouton
  const rect = anchorBtn.getBoundingClientRect();
  const popupW = 240;
  let left = rect.left;
  if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
  popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
  popup.style.left = `${left}px`;

  setTimeout(() => document.addEventListener('click', dpOutsideClick), 0);
}

function dpOutsideClick(e) {
  const popup = document.getElementById('dp-popup');
  if (popup && !popup.contains(e.target)) closeDatePicker();
}

function closeDatePicker() {
  const popup = document.getElementById('dp-popup');
  if (popup) popup.remove();
  document.removeEventListener('click', dpOutsideClick);
  dpTarget = null;
}

function renderDPContent(popup, selectedVal) {
  const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const DAYS = ['Lu','Ma','Me','Je','Ve','Sa','Di'];
  const today = new Date(); today.setHours(0,0,0,0);
  const year = dpViewMonth.getFullYear();
  const month = dpViewMonth.getMonth();

  const selectedDate = selectedVal ? new Date(selectedVal) : null;
  if (selectedDate) selectedDate.setHours(0,0,0,0);

  const maxDate = dpTarget && dpTarget.maxDate ? new Date(dpTarget.maxDate) : null;
  if (maxDate) maxDate.setHours(0,0,0,0);
  const minDate = dpTarget && dpTarget.minDate ? new Date(dpTarget.minDate) : null;
  if (minDate) minDate.setHours(0,0,0,0);

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const lastDay = new Date(year, month + 1, 0).getDate();

  let html = `
    <div class="dp-header">
      <button class="dp-nav" id="dp-prev">‹</button>
      <span class="dp-title">${MONTHS[month]} ${year}</span>
      <button class="dp-nav" id="dp-next">›</button>
    </div>
    <div class="dp-grid">
      ${DAYS.map(d => `<span class="dp-label">${d}</span>`).join('')}
      ${Array(firstDow).fill('<span></span>').join('')}
  `;

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d);
    date.setHours(0,0,0,0);
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = date.getTime() === today.getTime();
    const isSelected = selectedDate && date.getTime() === selectedDate.getTime();
    const disabled = (maxDate && date > maxDate) || (minDate && date < minDate);
    let cls = 'dp-day';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';
    if (disabled) cls += ' disabled';
    html += `<button class="${cls}" ${disabled ? 'disabled' : ''} data-date="${dateStr}">${d}</button>`;
  }

  html += `</div><button class="dp-clear" id="dp-clear">✕ Effacer la date</button>`;
  popup.innerHTML = html;

  popup.querySelector('#dp-prev').addEventListener('click', e => {
    e.stopPropagation();
    dpViewMonth = new Date(year, month - 1, 1);
    renderDPContent(popup, selectedVal);
  });
  popup.querySelector('#dp-next').addEventListener('click', e => {
    e.stopPropagation();
    dpViewMonth = new Date(year, month + 1, 1);
    renderDPContent(popup, selectedVal);
  });
  popup.querySelectorAll('.dp-day:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await applyDueDate(btn.dataset.date);
      closeDatePicker();
    });
  });
  popup.querySelector('#dp-clear').addEventListener('click', async e => {
    e.stopPropagation();
    await applyDueDate(null);
    closeDatePicker();
  });
}

async function applyDueDate(dateStr) {
  if (!dpTarget) return;
  const newDate = dateStr ? new Date(dateStr) : null;
  if (dpTarget.type === 'mission') {
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === dpTarget.mid);
      if (m) m.dueDate = newDate;
    });
  } else {
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === dpTarget.mid);
      if (m && m.subtasks) {
        const st = m.subtasks.find(x => x.id === dpTarget.stid);
        if (st) st.dueDate = newDate;
      }
    });
  }
  await saveFile(); renderSections();
}

/* ===== THEME ===== */
function applyTheme(theme, persistToDb = true) {
  const root = document.documentElement;
  const sunIcon = $('#theme-icon-sun'), moonIcon = $('#theme-icon-moon');
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  } else {
    root.removeAttribute('data-theme');
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }

  if (currentUser) {
    localStorage.setItem('tdl_theme_' + currentUser._id, theme);
    if (persistToDb) {
      API.patch('/auth/me', { theme }).catch(console.error);
    }
  } else {
    localStorage.setItem('tdl_theme', theme);
  }
}

// Initial default theme (guest mode)
applyTheme(localStorage.getItem('tdl_theme') || 'dark', false);

$('#theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const target = current === 'dark' ? 'light' : 'dark';
  applyTheme(target, true);
});

/* ===== SETTINGS MODULE ===== */
(function () {
  const panel    = $('#settings-panel');
  const overlay  = $('#settings-overlay');
  const openBtn  = $('#settings-btn');
  const closeBtn = $('#settings-close');

  function openSettings() {
    panel.classList.add('open');
    overlay.classList.add('open');
    // Populate profile fields
    if (currentUser) {
      $('#settings-name').value = currentUser.name || '';
      $('#settings-email').textContent = currentUser.email || '';
    }
  }
  function closeSettings() {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    // Reset delete confirm box
    $('#delete-confirm-box').style.display = 'none';
    $('#delete-password').value = '';
    $('#delete-error').textContent = '';
  }

  openBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);
  overlay.addEventListener('click', closeSettings);

  /* ── PROFILE: Save name ── */
  $('#settings-save-name').addEventListener('click', async () => {
    const newName = $('#settings-name').value.trim();
    if (!newName) return toast('Le nom ne peut pas être vide.');
    if (newName === (currentUser && currentUser.name)) return;
    try {
      const data = await API.req('PATCH', '/auth/me', { name: newName });
      currentUser = data.user;
      // Update greeting in header
      const greet = $('#user-greeting');
      if (greet) greet.textContent = `Bonjour, ${currentUser.name}`;
      toast('Nom mis à jour !');
    } catch (err) {
      toast('Erreur : ' + err.message);
    }
  });

  /* ── PROFILE: Change password link ── */
  $('#settings-change-pwd').addEventListener('click', () => {
    closeSettings();
    // Logout then redirect to forgot password form
    localStorage.removeItem('tdl_token');
    currentUser = null;
    showScreen('auth-screen');
    // Trigger the forgot-password form
    setTimeout(() => {
      $('#login-form').classList.add('hidden');
      $('#forgot-form').classList.remove('hidden');
      $('#forgot-email').focus();
    }, 100);
  });

  /* ── PROFILE: Delete account ── */
  $('#delete-account-btn').addEventListener('click', () => {
    $('#delete-confirm-box').style.display = 'block';
    $('#delete-password').focus();
  });
  $('#delete-cancel-btn').addEventListener('click', () => {
    $('#delete-confirm-box').style.display = 'none';
    $('#delete-password').value = '';
    $('#delete-error').textContent = '';
  });
  $('#delete-confirm-btn').addEventListener('click', async () => {
    const pwd = $('#delete-password').value;
    const errEl = $('#delete-error');
    errEl.textContent = '';
    if (!pwd) { errEl.textContent = 'Veuillez saisir votre mot de passe.'; return; }
    try {
      await API.req('DELETE', '/auth/me', { password: pwd });
      // Clean up and log out
      localStorage.removeItem('tdl_token');
      localStorage.removeItem('tdl_wallpaper');
      localStorage.removeItem('tdl_accent');
      currentUser = null;
      closeSettings();
      showScreen('auth-screen');
      toast('Compte supprimé.');
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  /* ── CANVAS COLOR PICKER CLASS ── */
  class CanvasColorPicker {
    constructor(containerId, initialHex, onChange) {
      this.container = $('#' + containerId);
      this.canvasSatVal = this.container.querySelector('.cp-satval');
      this.canvasHue = this.container.querySelector('.cp-hue');
      this.cursorSatVal = this.container.querySelector('.cp-cursor');
      this.cursorHue = this.container.querySelector('.cp-hue-cursor');
      this.previewSwatch = this.container.querySelector('.cp-preview-swatch');
      this.hexLabel = this.container.querySelector('.cp-hex-label');

      this.onChange = onChange;
      this.ctxSatVal = this.canvasSatVal.getContext('2d', { willReadFrequently: true });
      this.ctxHue = this.canvasHue.getContext('2d', { willReadFrequently: true });

      this.currentHue = 0;
      this.currentSat = 100;
      this.currentVal = 100;

      this.initHueCanvas();
      this.setColor(initialHex);
      this.setupEvents();
    }

    setColor(hex) {
      const rgb = this.hexToRgb(hex);
      if (!rgb) return;
      const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
      this.currentHue = hsv.h;
      this.currentSat = hsv.s * 100;
      this.currentVal = hsv.v * 100;

      this.drawSatValCanvas();
      this.updateUI();
    }

    initHueCanvas() {
      const w = this.canvasHue.width;
      const h = this.canvasHue.height;
      this.ctxHue.clearRect(0, 0, w, h);
      const grad = this.ctxHue.createLinearGradient(0, 0, w, 0);
      const stops = [0, 60, 120, 180, 240, 300, 360];
      stops.forEach(stop => {
        grad.addColorStop(stop / 360, `hsl(${stop}, 100%, 50%)`);
      });
      this.ctxHue.fillStyle = grad;
      this.ctxHue.fillRect(0, 0, w, h);
    }

    drawSatValCanvas() {
      const w = this.canvasSatVal.width;
      const h = this.canvasSatVal.height;
      this.ctxSatVal.clearRect(0, 0, w, h);

      // Base color for Hue
      this.ctxSatVal.fillStyle = `hsl(${this.currentHue}, 100%, 50%)`;
      this.ctxSatVal.fillRect(0, 0, w, h);

      // Saturation (white to transparent)
      const whiteGrad = this.ctxSatVal.createLinearGradient(0, 0, w, 0);
      whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      this.ctxSatVal.fillStyle = whiteGrad;
      this.ctxSatVal.fillRect(0, 0, w, h);

      // Value (transparent to black)
      const blackGrad = this.ctxSatVal.createLinearGradient(0, 0, 0, h);
      blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      blackGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
      this.ctxSatVal.fillStyle = blackGrad;
      this.ctxSatVal.fillRect(0, 0, w, h);
    }

    updateUI() {
      const wSV = this.canvasSatVal.width;
      const hSV = this.canvasSatVal.height;
      const xSV = (this.currentSat / 100) * wSV;
      const ySV = (1 - (this.currentVal / 100)) * hSV;
      this.cursorSatVal.style.left = `${xSV}px`;
      this.cursorSatVal.style.top = `${ySV}px`;

      const wH = this.canvasHue.width;
      const xH = (this.currentHue / 360) * wH;
      this.cursorHue.style.left = `${xH}px`;

      const hex = this.getHex();
      this.previewSwatch.style.backgroundColor = hex;
      this.hexLabel.textContent = hex;
    }

    getHex() {
      const rgb = this.hsvToRgb(this.currentHue / 360, this.currentSat / 100, this.currentVal / 100);
      return this.rgbToHex(rgb.r, rgb.g, rgb.b);
    }

    setupEvents() {
      let isDraggingSV = false;
      let isDraggingHue = false;

      const handleSV = (clientX, clientY) => {
        const rect = this.canvasSatVal.getBoundingClientRect();
        let x = clientX - rect.left;
        let y = clientY - rect.top;
        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        this.currentSat = (x / rect.width) * 100;
        this.currentVal = (1 - (y / rect.height)) * 100;
        this.updateUI();
        if (this.onChange) this.onChange(this.getHex());
      };

      const handleHue = (clientX) => {
        const rect = this.canvasHue.getBoundingClientRect();
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));

        this.currentHue = (x / rect.width) * 360;
        this.drawSatValCanvas();
        this.updateUI();
        if (this.onChange) this.onChange(this.getHex());
      };

      this.canvasSatVal.addEventListener('mousedown', (e) => {
        isDraggingSV = true;
        handleSV(e.clientX, e.clientY);
      });

      this.canvasHue.addEventListener('mousedown', (e) => {
        isDraggingHue = true;
        handleHue(e.clientX);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDraggingSV) handleSV(e.clientX, e.clientY);
        if (isDraggingHue) handleHue(e.clientX);
      });

      window.addEventListener('mouseup', () => {
        isDraggingSV = false;
        isDraggingHue = false;
      });

      // Touch events
      this.canvasSatVal.addEventListener('touchstart', (e) => {
        isDraggingSV = true;
        const t = e.touches[0];
        handleSV(t.clientX, t.clientY);
      }, { passive: true });

      this.canvasHue.addEventListener('touchstart', (e) => {
        isDraggingHue = true;
        const t = e.touches[0];
        handleHue(t.clientX);
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 0) return;
        const t = e.touches[0];
        if (isDraggingSV) handleSV(t.clientX, t.clientY);
        if (isDraggingHue) handleHue(t.clientX);
      }, { passive: true });

      window.addEventListener('touchend', () => {
        isDraggingSV = false;
        isDraggingHue = false;
      });
    }

    hexToRgb(hex) {
      const clean = hex.replace('#', '');
      const num = parseInt(clean, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    }

    rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, v = max;
      const d = max - min;
      s = max === 0 ? 0 : d / max;
      if (max === min) {
        h = 0;
      } else {
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return { h: h * 360, s, v };
    }

    hsvToRgb(h, s, v) {
      let r, g, b;
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
      };
    }

    rgbToHex(r, g, b) {
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
  }

  /* ── WALLPAPER ── */
  const wallpaperStyleTag = (() => {
    const s = document.createElement('style');
    s.id = 'wallpaper-dynamic';
    document.head.appendChild(s);
    return s;
  })();

  let wpColorPickerInstance = null;

  applyWallpaper = function (cfg, persistToDb = true) {
    const screens = ['#home-screen', '#file-screen', '#trash-screen'];
    if (cfg.type === 'default') {
      wallpaperStyleTag.textContent = '';
    } else if (cfg.type === 'color') {
      wallpaperStyleTag.textContent = `
        ${screens.map(s => s + '::before').join(', ')} {
          background-image: none !important;
          background: ${cfg.value} !important;
          filter: none !important;
          opacity: 1 !important;
        }
        ${screens.map(s => s + '::after').join(', ')} {
          background: transparent !important;
        }
      `;
    } else if (cfg.type === 'image') {
      wallpaperStyleTag.textContent = `
        ${screens.map(s => s + '::before').join(', ')} {
          background-image: url('${cfg.value}') !important;
          filter: none !important;
          opacity: 1 !important;
        }
        ${screens.map(s => s + '::after').join(', ')} {
          background: rgba(10,10,16,0.55) !important;
        }
        [data-theme="light"] ${screens.map(s => s + '::after').join(', [data-theme="light"] ')} {
          background: rgba(244,245,247,0.65) !important;
        }
      `;
    }

    if (currentUser) {
      localStorage.setItem('tdl_wallpaper_' + currentUser._id, JSON.stringify(cfg));
      if (persistToDb) {
        API.patch('/auth/me', { wallpaper: JSON.stringify(cfg) }).catch(console.error);
      }
    }

    const radios = document.querySelectorAll('input[name="wallpaper"]');
    radios.forEach(r => { r.checked = r.value === cfg.type; });

    if (cfg.type === 'color') {
      $('#wp-color-row').style.display = 'block';
      $('#wp-image-row').style.display = 'none';
      if (wpColorPickerInstance) {
        wpColorPickerInstance.setColor(cfg.value);
      }
      $('#wp-color-preview').style.background = cfg.value;
    } else if (cfg.type === 'image') {
      $('#wp-color-row').style.display = 'none';
      $('#wp-image-row').style.display = 'flex';
    } else {
      $('#wp-color-row').style.display = 'none';
      $('#wp-image-row').style.display = 'none';
    }
  };

  // Instantiate wallpaper picker
  wpColorPickerInstance = new CanvasColorPicker('wp-cpw', '#1a1a30', (hex) => {
    applyWallpaper({ type: 'color', value: hex });
  });

  document.querySelectorAll('input[name="wallpaper"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const type = radio.value;
      if (type === 'default') applyWallpaper({ type: 'default' });
      else if (type === 'color') {
        const hex = wpColorPickerInstance.getHex();
        applyWallpaper({ type: 'color', value: hex });
      }
      else if (type === 'image') {
        applyWallpaper({ type: 'image', value: '' });
        $('#wp-image-row').style.display = 'flex';
      }
    });
  });

  $('#wp-upload-btn').addEventListener('click', () => $('#wallpaper-file-input').click());
  $('#wallpaper-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('Image trop lourde (max 2 Mo).');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      $('#wp-image-preview').style.background = `url(${dataUrl}) center/cover`;
      $('#wp-image-preview').textContent = '';
      applyWallpaper({ type: 'image', value: dataUrl });
      toast('Fond d\'écran appliqué !');
    };
    reader.readAsDataURL(file);
  });

  /* ── ACCENT COLOR ── */
  const DEFAULT_ACCENT = '#6C5CE7';

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function lightenHex(hex, amount = 30) {
    let { r, g, b } = hexToRgb(hex);
    r = Math.min(255, r + amount); g = Math.min(255, g + amount); b = Math.min(255, b + amount);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  let accColorPickerInstance = null;

  applyAccent = function (hex, persistToDb = true) {
    const root = document.documentElement;
    const { r, g, b } = hexToRgb(hex);
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-light', lightenHex(hex, 30));
    root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.25)`);
    root.style.setProperty('--border-focus', hex);

    if (currentUser) {
      localStorage.setItem('tdl_accent_' + currentUser._id, hex);
      if (persistToDb) {
        API.patch('/auth/me', { accent: hex }).catch(console.error);
      }
    }

    if (accColorPickerInstance) {
      accColorPickerInstance.setColor(hex);
    }

    document.querySelectorAll('.accent-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === hex);
    });
  };

  // Instantiate accent color picker
  accColorPickerInstance = new CanvasColorPicker('acc-cpw', '#6C5CE7', (hex) => {
    applyAccent(hex);
  });

  // Apply startup defaults
  applyWallpaper({ type: 'default' }, false);
  applyAccent(DEFAULT_ACCENT, false);

  document.querySelectorAll('.accent-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      applyAccent(swatch.dataset.color);
    });
  });

  $('#accent-reset-btn').addEventListener('click', () => {
    applyAccent(DEFAULT_ACCENT);
    toast('Couleur réinitialisée.');
  });

})(); // end settings module



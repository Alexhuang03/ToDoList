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
  del(path) { return this.req('DELETE', path); },
};

/* ===== STATE ===== */
let currentUser = null;
let currentFile = null;
let pollInterval = null;
const expandedMissions = new Set();

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
  showScreen('auth-screen');
});

function enterApp() {
  $('#user-greeting').textContent = `Bonjour, ${currentUser.name}`;
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

/* ===== QUICK ENTRY ===== */
$('#quick-entry').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const val = e.target.value.trim();
  if (!val) return;
  const hashMatch = val.match(/#(\S+)/);
  const sectionName = hashMatch ? hashMatch[1] : 'Général';
  const missionText = val.replace(/#\S+/g, '').trim();
  if (!missionText) return;
  let sec = currentFile.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase());
  if (!sec) { sec = { name: sectionName, missions: [] }; currentFile.sections.push(sec); }
  sec.missions.push({ id: uid(), text: missionText, done: false, subtasks: [] });
  e.target.value = '';
  await saveFile();
  renderSections();
});

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
    html += `<div class="section"><div class="section-header"><span class="section-tag"># ${esc(sec.name)}</span><span class="section-count">${doneCount}/${sec.missions.length}</span></div>`;
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
  const dateBadge = m.dueDate ? `<span class="mission-date ${mClass}">${dateBadgeEmoji(mClass)} ${formatDate(m.dueDate)}</span>` : '';
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
      const stDateBadge = st.dueDate ? `<span class="subtask-date ${stClass}">${dateBadgeEmoji(stClass)} ${formatDate(st.dueDate)}</span>` : '';
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
  document.querySelectorAll('[data-check]').forEach(btn => btn.addEventListener('click', async () => {
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === btn.dataset.check);
      if (m) {
        m.done = !m.done;
        // Cascader l'état à toutes les sous-missions
        if (m.subtasks && m.subtasks.length > 0) {
          m.subtasks.forEach(st => st.done = m.done);
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
        if (st) st.done = !st.done;
        if (m.subtasks.length > 0 && m.subtasks.every(x => x.done)) m.done = true;
        if (m.subtasks.some(x => !x.done)) m.done = false;
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
function applyTheme(theme) {
  const root = document.documentElement;
  const sunIcon = $('#theme-icon-sun'), moonIcon = $('#theme-icon-moon');
  if (theme === 'light') { root.setAttribute('data-theme', 'light'); sunIcon.style.display = 'block'; moonIcon.style.display = 'none'; }
  else { root.removeAttribute('data-theme'); sunIcon.style.display = 'none'; moonIcon.style.display = 'block'; }
  localStorage.setItem('tdl_theme', theme);
}
applyTheme(localStorage.getItem('tdl_theme') || 'dark');
$('#theme-toggle').addEventListener('click', () => { applyTheme(localStorage.getItem('tdl_theme') === 'dark' ? 'light' : 'dark'); });

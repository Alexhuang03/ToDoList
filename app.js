/* ===== DATA LAYER ===== */
const DB = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  getUsers() { return this.get('tdl_users') || []; },
  saveUsers(u) { this.set('tdl_users', u); },
  getSession() { return this.get('tdl_session'); },
  setSession(s) { this.set('tdl_session', s); },
  clearSession() { localStorage.removeItem('tdl_session'); },
  getFiles(uid) { return this.get(`tdl_files_${uid}`) || []; },
  saveFiles(uid, f) { this.set(`tdl_files_${uid}`, f); },
  getTrash(uid) { return this.get(`tdl_trash_${uid}`) || []; },
  saveTrash(uid, t) { this.set(`tdl_trash_${uid}`, t); },
};

let currentUser = null;
let currentFileId = null;

/* ===== HELPERS ===== */
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);

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

/* ===== AUTH ===== */
$('#show-register').addEventListener('click', e => { e.preventDefault(); $('#login-form').classList.add('hidden'); $('#register-form').classList.remove('hidden'); });
$('#show-login').addEventListener('click', e => { e.preventDefault(); $('#register-form').classList.add('hidden'); $('#login-form').classList.remove('hidden'); });

$('#register-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#register-name').value.trim();
  const email = $('#register-email').value.trim().toLowerCase();
  const pass = $('#register-password').value;
  const users = DB.getUsers();
  if (users.find(u => u.email === email)) { $('#register-error').textContent = 'Cet e-mail est déjà utilisé.'; return; }
  const user = { id: uid(), name, email, pass };
  users.push(user);
  DB.saveUsers(users);
  DB.setSession(user.id);
  currentUser = user;
  enterApp();
});

$('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  const email = $('#login-email').value.trim().toLowerCase();
  const pass = $('#login-password').value;
  const user = DB.getUsers().find(u => u.email === email && u.pass === pass);
  if (!user) { $('#login-error').textContent = 'Identifiants incorrects.'; return; }
  DB.setSession(user.id);
  currentUser = user;
  enterApp();
});

$('#logout-btn').addEventListener('click', () => { DB.clearSession(); currentUser = null; showScreen('auth-screen'); });

function enterApp() {
  $('#user-greeting').textContent = `Bonjour, ${currentUser.name}`;
  renderHome();
  showScreen('home-screen');
}

/* ===== AUTO-LOGIN ===== */
(function init() {
  const sid = DB.getSession();
  if (sid) {
    const user = DB.getUsers().find(u => u.id === sid);
    if (user) { currentUser = user; enterApp(); return; }
  }
  showScreen('auth-screen');
})();

/* ===== HOME: FILES GRID ===== */
function renderHome() {
  const grid = $('#files-grid');
  const files = DB.getFiles(currentUser.id);
  const trash = DB.getTrash(currentUser.id);
  let html = '';

  // Trash card first
  html += `<div class="file-card trash-card" data-action="trash">
    <div class="file-card-name">🗑️ Corbeille</div>
    <div class="file-card-meta">${trash.length} élément(s)</div>
  </div>`;

  files.forEach(f => {
    const total = countTasks(f);
    const done = countDone(f);
    html += `<div class="file-card" data-id="${f.id}">
      <div class="file-share-actions">
        <button class="icon-btn" data-share="${f.id}" title="Partager">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
      </div>
      <div class="file-card-actions">
        <button class="icon-btn danger" data-delete="${f.id}" title="Supprimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
      <div class="file-card-name">${esc(f.name)}</div>
      <div class="file-card-meta">${total} mission(s) · ${done} terminée(s)</div>
    </div>`;
  });

  grid.innerHTML = html;

  // Event delegation
  grid.querySelectorAll('.file-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-share]')) { openShareModal(e.target.closest('[data-share]').dataset.share); return; }
      if (e.target.closest('[data-delete]')) { deleteFile(e.target.closest('[data-delete]').dataset.delete); return; }
      if (card.dataset.action === 'trash') { openTrash(); return; }
      if (card.dataset.id) openFile(card.dataset.id);
    });
  });
}

function countTasks(f) { return (f.sections || []).reduce((s, sec) => s + sec.missions.length, 0); }
function countDone(f) { return (f.sections || []).reduce((s, sec) => s + sec.missions.filter(m => m.done).length, 0); }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

/* ===== NEW FILE MODAL ===== */
$('#add-file-btn').addEventListener('click', () => { $('#modal-overlay').classList.add('active'); $('#new-file-name').value = ''; setTimeout(() => $('#new-file-name').focus(), 100); });
$('#modal-cancel').addEventListener('click', () => $('#modal-overlay').classList.remove('active'));
$('#modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) $('#modal-overlay').classList.remove('active'); });

$('#modal-confirm').addEventListener('click', () => {
  const name = $('#new-file-name').value.trim();
  if (!name) return;
  const files = DB.getFiles(currentUser.id);
  files.push({ id: uid(), name, sections: [], sharedWith: [] });
  DB.saveFiles(currentUser.id, files);
  $('#modal-overlay').classList.remove('active');
  toast('Fichier créé !');
  renderHome();
});
$('#new-file-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#modal-confirm').click(); } });

/* ===== DELETE FILE ===== */
function deleteFile(id) {
  const files = DB.getFiles(currentUser.id);
  const idx = files.findIndex(f => f.id === id);
  if (idx === -1) return;
  const file = files.splice(idx, 1)[0];
  DB.saveFiles(currentUser.id, files);
  const trash = DB.getTrash(currentUser.id);
  trash.push({ type: 'file', data: file, deletedAt: Date.now() });
  DB.saveTrash(currentUser.id, trash);
  toast('Fichier déplacé dans la corbeille');
  renderHome();
}

/* ===== SHARE MODAL ===== */
let shareFileId = null;
function openShareModal(fid) {
  shareFileId = fid;
  const files = DB.getFiles(currentUser.id);
  const f = files.find(x => x.id === fid);
  if (!f) return;
  $('#share-file-name').textContent = `Fichier : ${f.name}`;
  $('#share-email').value = '';
  renderSharedUsers(f);
  $('#share-overlay').classList.add('active');
}
$('#share-close').addEventListener('click', () => $('#share-overlay').classList.remove('active'));
$('#share-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) $('#share-overlay').classList.remove('active'); });

$('#share-add-btn').addEventListener('click', () => {
  const email = $('#share-email').value.trim().toLowerCase();
  if (!email) return;
  const files = DB.getFiles(currentUser.id);
  const f = files.find(x => x.id === shareFileId);
  if (!f) return;
  if (!f.sharedWith) f.sharedWith = [];
  if (f.sharedWith.includes(email)) { toast('Déjà partagé avec cet utilisateur'); return; }
  f.sharedWith.push(email);
  DB.saveFiles(currentUser.id, files);
  $('#share-email').value = '';
  renderSharedUsers(f);
  toast(`Invitation envoyée à ${email}`);
});

function renderSharedUsers(f) {
  const list = $('#shared-users-list');
  if (!f.sharedWith || f.sharedWith.length === 0) { list.innerHTML = '<p style="color:var(--text-dim);font-size:0.82rem;">Aucun collaborateur pour le moment.</p>'; return; }
  list.innerHTML = f.sharedWith.map(email => `<div class="shared-user"><span class="shared-user-email">${esc(email)}</span><button class="icon-btn danger" data-remove-share="${email}" title="Retirer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`).join('');
  list.querySelectorAll('[data-remove-share]').forEach(btn => {
    btn.addEventListener('click', () => {
      const files = DB.getFiles(currentUser.id);
      const file = files.find(x => x.id === shareFileId);
      file.sharedWith = file.sharedWith.filter(e => e !== btn.dataset.removeShare);
      DB.saveFiles(currentUser.id, files);
      renderSharedUsers(file);
    });
  });
}

/* ===== TRASH SCREEN ===== */
function openTrash() {
  renderTrash();
  showScreen('trash-screen');
}
$('#trash-back-btn').addEventListener('click', () => { showScreen('home-screen'); renderHome(); });

$('#empty-trash-btn').addEventListener('click', () => {
  DB.saveTrash(currentUser.id, []);
  toast('Corbeille vidée');
  renderTrash();
});

function renderTrash() {
  const trash = DB.getTrash(currentUser.id);
  const container = $('#trash-content');
  const emptyEl = $('#trash-empty-state');
  if (trash.length === 0) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');
  container.innerHTML = trash.map((item, i) => {
    const label = item.type === 'file' ? `📁 ${esc(item.data.name)}` : `✓ ${esc(item.data.text)}`;
    const origin = item.type === 'file' ? 'Fichier supprimé' : `De : ${esc(item.origin || '')}`;
    return `<div class="trash-item"><div class="trash-item-info"><span class="trash-item-name">${label}</span><span class="trash-item-origin">${origin}</span></div><button class="btn-restore" data-restore="${i}">Restaurer</button></div>`;
  }).join('');
  container.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', () => restoreTrashItem(parseInt(btn.dataset.restore)));
  });
}

function restoreTrashItem(idx) {
  const trash = DB.getTrash(currentUser.id);
  const item = trash.splice(idx, 1)[0];
  DB.saveTrash(currentUser.id, trash);
  if (item.type === 'file') {
    const files = DB.getFiles(currentUser.id);
    files.push(item.data);
    DB.saveFiles(currentUser.id, files);
    toast('Fichier restauré');
  } else if (item.type === 'mission') {
    const files = DB.getFiles(currentUser.id);
    const f = files.find(x => x.id === item.fileId);
    if (f) {
      let sec = f.sections.find(s => s.name === item.sectionName);
      if (!sec) { sec = { name: item.sectionName, missions: [] }; f.sections.push(sec); }
      sec.missions.push(item.data);
      DB.saveFiles(currentUser.id, files);
    }
    toast('Mission restaurée');
  }
  renderTrash();
}

/* ===== FILE DETAIL ===== */
function openFile(fid) {
  currentFileId = fid;
  const f = getFile();
  if (!f) return;
  $('#file-title').textContent = f.name;
  $('#quick-entry').value = '';
  renderSections();
  showScreen('file-screen');
  setTimeout(() => $('#quick-entry').focus(), 100);
}

$('#back-btn').addEventListener('click', () => { currentFileId = null; renderHome(); showScreen('home-screen'); });

function getFile() {
  return DB.getFiles(currentUser.id).find(f => f.id === currentFileId);
}
function saveFile(f) {
  const files = DB.getFiles(currentUser.id);
  const idx = files.findIndex(x => x.id === f.id);
  if (idx !== -1) files[idx] = f;
  DB.saveFiles(currentUser.id, files);
}

/* ===== QUICK ENTRY ===== */
$('#quick-entry').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const val = e.target.value.trim();
  if (!val) return;
  const hashMatch = val.match(/#(\S+)/);
  const sectionName = hashMatch ? hashMatch[1] : 'Général';
  const missionText = val.replace(/#\S+/g, '').trim();
  if (!missionText) return;

  const f = getFile();
  let sec = f.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase());
  if (!sec) { sec = { name: sectionName, missions: [] }; f.sections.push(sec); }
  sec.missions.push({ id: uid(), text: missionText, done: false, subtasks: [] });
  saveFile(f);
  e.target.value = '';
  renderSections();
});

/* ===== RENDER SECTIONS ===== */
function renderSections() {
  const f = getFile();
  if (!f) return;
  const container = $('#sections-container');
  const emptyEl = $('#empty-state');
  const totalMissions = countTasks(f);
  const doneMissions = countDone(f);

  if (totalMissions === 0) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); } else { emptyEl.classList.add('hidden'); }

  // Progress
  const pct = totalMissions > 0 ? Math.round((doneMissions / totalMissions) * 100) : 0;
  $('#progress-fill').style.width = pct + '%';
  $('#progress-text').textContent = pct + '%';

  let html = '';
  f.sections.forEach(sec => {
    const sorted = [...sec.missions].sort((a, b) => a.done - b.done);
    const doneCount = sec.missions.filter(m => m.done).length;
    html += `<div class="section"><div class="section-header"><span class="section-tag"># ${esc(sec.name)}</span><span class="section-count">${doneCount}/${sec.missions.length}</span></div>`;
    sorted.forEach(m => { html += renderMission(m, sec.name); });
    html += `</div>`;
  });
  container.innerHTML = html;
  bindMissionEvents();
}

function renderMission(m, secName) {
  const hasSubtasks = m.subtasks && m.subtasks.length > 0;
  const arrow = hasSubtasks ? `<button class="subtask-toggle" data-toggle="${m.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>` : '';

  let sub = '';
  if (hasSubtasks) {
    const sortedSub = [...m.subtasks].sort((a, b) => a.done - b.done);
    sub = `<div class="subtasks-list" data-parent="${m.id}">`;
    sortedSub.forEach(st => {
      sub += `<div class="subtask-item${st.done ? ' completed' : ''}" data-stid="${st.id}">
        <button class="subtask-check${st.done ? ' checked' : ''}" data-stcheck="${st.id}" data-mid="${m.id}"></button>
        <span class="subtask-text" data-stedit="${st.id}" data-mid="${m.id}">${esc(st.text)}</span>
        <div class="subtask-actions"><button class="icon-btn danger" data-stdel="${st.id}" data-mid="${m.id}" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></div>
      </div>`;
    });
    sub += '</div>';
  }

  return `<div class="mission-item${m.done ? ' completed' : ''}" data-mid="${m.id}" data-sec="${esc(secName)}">
    <button class="mission-check${m.done ? ' checked' : ''}" data-check="${m.id}"></button>
    ${arrow}
    <span class="mission-text" data-edit="${m.id}">${esc(m.text)}</span>
    <div class="mission-actions">
      <button class="icon-btn" data-addsub="${m.id}" title="Ajouter sous-mission"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button class="icon-btn danger" data-del="${m.id}" title="Supprimer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
    </div>
  </div>${sub}`;
}

/* ===== MISSION EVENTS ===== */
function bindMissionEvents() {
  // Check / uncheck mission
  document.querySelectorAll('[data-check]').forEach(btn => btn.addEventListener('click', () => {
    const f = getFile();
    f.sections.forEach(s => { const m = s.missions.find(x => x.id === btn.dataset.check); if (m) m.done = !m.done; });
    saveFile(f); renderSections();
  }));

  // Edit mission text (click to edit)
  document.querySelectorAll('[data-edit]').forEach(span => span.addEventListener('click', () => {
    const mid = span.dataset.edit;
    const current = span.textContent;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.value = current;
    span.replaceWith(input);
    input.focus();
    const save = () => {
      const val = input.value.trim();
      if (val && val !== current) {
        const f = getFile();
        f.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m) m.text = val; });
        saveFile(f);
      }
      renderSections();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') renderSections(); });
  }));

  // Delete mission
  document.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
    const f = getFile();
    const mid = btn.dataset.del;
    f.sections.forEach(s => {
      const idx = s.missions.findIndex(x => x.id === mid);
      if (idx !== -1) {
        const removed = s.missions.splice(idx, 1)[0];
        const trash = DB.getTrash(currentUser.id);
        trash.push({ type: 'mission', data: removed, fileId: f.id, sectionName: s.name, origin: f.name + ' / ' + s.name, deletedAt: Date.now() });
        DB.saveTrash(currentUser.id, trash);
      }
    });
    // Remove empty sections
    f.sections = f.sections.filter(s => s.missions.length > 0);
    saveFile(f); toast('Mission supprimée'); renderSections();
  }));

  // Add subtask
  document.querySelectorAll('[data-addsub]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.addsub;
    const missionEl = btn.closest('.mission-item');
    let subList = missionEl.nextElementSibling;
    // Create inline input
    const f = getFile();
    let mission = null;
    f.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m) mission = m; });
    if (!mission) return;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.placeholder = 'Nouvelle sous-mission...';
    input.style.marginLeft = '3.2rem'; input.style.marginTop = '0.3rem'; input.style.marginBottom = '0.3rem';
    missionEl.parentNode.insertBefore(input, missionEl.nextSibling);
    input.focus();
    const doAdd = () => {
      const val = input.value.trim();
      if (val) {
        if (!mission.subtasks) mission.subtasks = [];
        mission.subtasks.push({ id: uid(), text: val, done: false });
        saveFile(f);
      }
      renderSections();
    };
    input.addEventListener('blur', doAdd);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } if (e.key === 'Escape') renderSections(); });
  }));

  // Toggle subtasks
  document.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const mid = btn.dataset.toggle;
    btn.classList.toggle('open');
    const subList = document.querySelector(`.subtasks-list[data-parent="${mid}"]`);
    if (subList) subList.classList.toggle('open');
  }));

  // Check subtask
  document.querySelectorAll('[data-stcheck]').forEach(btn => btn.addEventListener('click', () => {
    const f = getFile();
    const stid = btn.dataset.stcheck;
    const mid = btn.dataset.mid;
    f.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m && m.subtasks) {
        const st = m.subtasks.find(x => x.id === stid);
        if (st) st.done = !st.done;
        // Auto-complete: if all subtasks done, mark mission done
        if (m.subtasks.length > 0 && m.subtasks.every(x => x.done)) { m.done = true; }
        // If any unchecked, uncheck parent
        if (m.subtasks.some(x => !x.done)) { m.done = false; }
      }
    });
    saveFile(f); renderSections();
  }));

  // Edit subtask
  document.querySelectorAll('[data-stedit]').forEach(span => span.addEventListener('click', () => {
    const stid = span.dataset.stedit;
    const mid = span.dataset.mid;
    const current = span.textContent;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.value = current; input.style.fontSize = '0.85rem';
    span.replaceWith(input);
    input.focus();
    const save = () => {
      const val = input.value.trim();
      if (val && val !== current) {
        const f = getFile();
        f.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m && m.subtasks) { const st = m.subtasks.find(x => x.id === stid); if (st) st.text = val; } });
        saveFile(f);
      }
      renderSections();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') renderSections(); });
  }));

  // Delete subtask
  document.querySelectorAll('[data-stdel]').forEach(btn => btn.addEventListener('click', () => {
    const f = getFile();
    const stid = btn.dataset.stdel;
    const mid = btn.dataset.mid;
    f.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m && m.subtasks) {
        m.subtasks = m.subtasks.filter(x => x.id !== stid);
        if (m.subtasks.length > 0 && m.subtasks.every(x => x.done)) m.done = true;
      }
    });
    saveFile(f); renderSections();
  }));
}

/* ===== THEME TOGGLE (JOUR / NUIT) ===== */
function applyTheme(theme) {
  const root = document.documentElement;
  const sunIcon = $('#theme-icon-sun');
  const moonIcon = $('#theme-icon-moon');
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  } else {
    root.removeAttribute('data-theme');
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }
  localStorage.setItem('tdl_theme', theme);
}

// Restore saved theme on load
applyTheme(localStorage.getItem('tdl_theme') || 'dark');

$('#theme-toggle').addEventListener('click', () => {
  const current = localStorage.getItem('tdl_theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

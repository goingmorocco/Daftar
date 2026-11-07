// Daftar — app shell: boot, auth, data loading, routing, layout.
import { supabaseApi, demoApi } from './api.js';
import { seedDemo } from './demo.js';
import * as L from './logic.js';
import { esc, icon, LOGO, toast, modal, field, input, select } from './ui.js';
import { views } from './views/index.js';

const cfg = window.APP_CONFIG || {};
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo') || cfg.DEMO === true || !cfg.SUPABASE_URL;
const root = document.getElementById('app');
if (!DEMO && !window.supabase) {
  root.innerHTML = '<div class="page"><div class="banner bad">Impossible de joindre le serveur (bibliothèque Supabase non chargée). Vérifiez la connexion internet puis rechargez la page.</div></div>';
  throw new Error('supabase-js not loaded');
}

const TABLES = ['ctr_settings', 'ctr_centers', 'ctr_levels', 'ctr_subjects', 'ctr_rooms', 'ctr_prices', 'ctr_teachers', 'ctr_members',
  'ctr_groups', 'ctr_group_slots', 'ctr_students', 'ctr_enrollments', 'ctr_invoices', 'ctr_payments', 'ctr_expenses',
  'ctr_teacher_payouts', 'ctr_waitlist', 'ctr_reminder_log'];
const KEY = t => t.replace('ctr_', '').replace('group_slots', 'slots').replace('teacher_payouts', 'payouts').replace('reminder_log', 'reminderLog');

export const app = {
  cfg, L, DEMO,
  api: DEMO ? demoApi(seedDemo) : supabaseApi(cfg),
  user: null, memberships: [], orgs: [], org: null, me: null, role: null, platformAdmin: false,
  s: {}, // data, keyed by short table name
  sessionsRange: null,
  centerId: '',
  view: null, viewState: {},

  // ---------- permissions ----------
  get isManager() { return this.role === 'owner' || this.role === 'admin'; },
  get isStaff() { return this.isManager || this.role === 'staff'; },
  get isTeacher() { return this.role === 'teacher'; },
  get active() { return this.org && L.planActive(this.org); },
  get settings() { return this.s.settings?.[0] || {}; },
  get cur() { return this.settings.currency || 'DH'; },
  money(n) { return L.money(n, this.cur); },

  // ---------- lookups ----------
  by(table, id) { return (this._idx[table] || new Map()).get(id); },
  name(table, id, fallback = '—') { const r = this.by(table, id); return r ? (r.name || r.full_name) : fallback; },
  inCenter(row) { return !this.centerId || !row.center_id || row.center_id === this.centerId; },
  _idx: {},

  derive() {
    this._idx = {};
    for (const [k, rows] of Object.entries(this.s)) if (Array.isArray(rows)) this._idx[k] = new Map(rows.filter(r => r.id).map(r => [r.id, r]));
    const fin = L.computeFinance(this.s.invoices || [], this.s.payments || [], this.settings.late_grace_days ?? 7);
    this.fin = fin;
    this._idx.invoices = new Map(fin.invoices.map(r => [r.id, r]));
    // teacher scope (RLS already filters live data; this keeps the demo honest too)
    if (this.isTeacher) {
      const tid = this.me?.teacher_id;
      this.s.groups = this.s.groups.filter(g => g.teacher_id === tid);
      const gids = new Set(this.s.groups.map(g => g.id));
      this.s.enrollments = this.s.enrollments.filter(e => gids.has(e.group_id));
      const sids = new Set(this.s.enrollments.map(e => e.student_id));
      this.s.students = this.s.students.filter(s => sids.has(s.id));
      this.s.slots = this.s.slots.filter(s => gids.has(s.group_id));
      this.s.sessions = (this.s.sessions || []).filter(s => gids.has(s.group_id));
      for (const k of ['invoices', 'payments', 'expenses', 'payouts', 'reminderLog', 'waitlist']) this.s[k] = [];
      this.fin = L.computeFinance([], [], 7);
    }
    this.studentStatus = new Map((this.s.students || []).map(st => [st.id, L.studentPaymentStatus(fin.byStudent.get(st.id))]));
    this.reminders = this.isStaff ? L.buildReminders({ invoices: this.fin.invoices, enrollments: this.s.enrollments, students: this.s.students,
      groups: this.s.groups, reminderLog: this.s.reminderLog, settings: this.settings, orgName: this.org.name }) : [];
  },

  async load(tables = TABLES) {
    const org_id = this.org.id;
    const res = await Promise.all(tables.map(t => this.api.list(t, { eq: { org_id } }).catch(e => { console.warn(t, e.message); return []; })));
    tables.forEach((t, i) => { this.s[KEY(t)] = res[i]; });
    this.derive();
  },
  async refresh(...short) {
    const tables = short.length ? TABLES.filter(t => short.includes(KEY(t))) : TABLES;
    await this.load(tables);
    if (short.includes('sessions') || !short.length) await this.loadSessions(this.sessionsRange.from, this.sessionsRange.to, true);
    this.render();
  },
  async loadSessions(from, to, force = false) {
    const r = this.sessionsRange;
    if (!force && r && from >= r.from && to <= r.to) return;
    const nf = r && !force ? (from < r.from ? from : r.from) : from;
    const nt = r && !force ? (to > r.to ? to : r.to) : to;
    await this.ensureSessions(nf, nt);
    this.s.sessions = await this.api.list('ctr_sessions', { eq: { org_id: this.org.id }, gte: { date: nf }, lte: { date: nt } });
    this.sessionsRange = { from: nf, to: nt };
    this.derive();
  },
  /** Create the sessions that the timetable implies (idempotent thanks to the unique key). */
  async ensureSessions(from, to) {
    if (!this.active || !(this.isStaff || this.isTeacher)) return;
    const genTo = to < L.addDays(L.today(), 42) ? to : L.addDays(L.today(), 42);
    if (genTo < from) return;
    const rows = L.plannedSessions(this.s.groups, this.s.slots, from, genTo);
    for (let i = 0; i < rows.length; i += 500) {
      await this.api.insert('ctr_sessions', rows.slice(i, i + 500), { onConflict: 'group_id,date,start_time', ignoreDuplicates: true }).catch(e => console.warn('sessions', e.message));
    }
  },
  async autoInvoices() {
    if (!this.isStaff || !this.active || !this.settings.auto_invoices) return;
    const rows = L.plannedInvoices(this.s.enrollments, this.s.groups, this.s.invoices, L.today());
    if (!rows.length) return;
    await this.api.insert('ctr_invoices', rows, { onConflict: 'enrollment_id,period_month', ignoreDuplicates: true }).catch(e => console.warn('invoices', e.message));
    await this.load(['ctr_invoices', 'ctr_organizations'].filter(t => TABLES.includes(t)));
  },

  // ---------- writes with feedback ----------
  async run(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { const m = L.friendlyError(e); toast(m, 'err'); const x = new Error(m); x.friendly = m; x.handled = true; throw x; }
  },
  async save(table, row, id) {
    return this.run(() => (id ? this.api.update(table, { id }, row) : this.api.insert(table, { org_id: this.org.id, ...row })).then(r => r[0]));
  },
  async del(table, match) { return this.run(() => this.api.remove(table, typeof match === 'string' ? { id: match } : match)); },

  // ---------- routing ----------
  route() {
    const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [path, qs] = h.split('?');
    const [name, id] = path.split('/');
    return { name, id, q: Object.fromEntries(new URLSearchParams(qs || '')) };
  },
  go(hash) { if (location.hash === hash) this.render(); else location.hash = hash; },
  rerender() { this.render(true); },

  render(keepFocus = false) {
    if (!this.org) return;
    const r = this.route();
    let v = views[r.name];
    if (!v || (v.allow && !v.allow(this))) { v = views[this.isTeacher ? 'schedule' : 'dashboard']; r.name = this.isTeacher ? 'schedule' : 'dashboard'; }
    if (this.view !== v) { this.viewState = {}; this.view = v; }
    const active = document.activeElement;
    const focusKey = keepFocus && active?.dataset?.input ? active.dataset.input : null;
    const caret = focusKey ? active.selectionStart : null;
    let html;
    try { html = v.render(this, r); } catch (e) { console.error(e); html = `<div class="page"><div class="banner bad">Erreur d'affichage : ${esc(e.message)}</div></div>`; }
    root.innerHTML = shell(this, r.name, html);
    document.title = `${v.title || ''} · ${cfg.APP_NAME || 'Daftar'}`;
    if (focusKey) { const el = root.querySelector(`[data-input="${focusKey}"]`); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch { /* not a text input */ } } }
    if (v.after) v.after(this, r, root);
  },
};

// ---------- layout ----------
function nav(app, current) {
  const remCount = app.reminders.filter(x => !x.sent && x.kind === 'unpaid').length;
  const pending = (app.s.members || []).filter(m => m.status === 'pending').length;
  const items = app.isTeacher
    ? [['schedule', 'calendar', 'Emploi du temps'], ['groups', 'layers', 'Mes groupes']]
    : [
        ['dashboard', 'home', 'Tableau de bord'], ['students', 'users', 'Élèves'], ['groups', 'layers', 'Groupes'],
        ['schedule', 'calendar', 'Emploi du temps'], ['payments', 'wallet', 'Paiements'], ['reminders', 'bell', 'Relances', remCount],
        ['waitlist', 'clock', "Liste d'attente"], ['teachers', 'teacher', 'Enseignants'],
        ...(app.isManager ? [['expenses', 'receipt', 'Dépenses']] : []),
      ];
  const admin = app.isManager ? [['team', 'team', 'Équipe', pending], ['settings', 'settings', 'Réglages'], ['billing', 'card', 'Abonnement']] : [];
  if (app.platformAdmin) admin.push(['admin', 'shield', 'Plateforme']);
  const link = ([k, ic, label, count]) => `<a href="#/${k}" class="${current === k ? 'active' : ''}" title="${esc(label)}">${icon(ic)}<span>${esc(label)}</span>${count ? `<span class="count">${count}</span>` : ''}</a>`;
  return `<nav class="nav">${items.map(link).join('')}</nav>${admin.length ? `<div class="nav-section">Administration</div><nav class="nav">${admin.map(link).join('')}</nav>` : ''}`;
}

function shell(app, current, content) {
  const orgOpts = app.orgs.length > 1 ? `<div class="org-switch"><select data-change="switchOrg" aria-label="Changer de centre">${app.orgs.map(o => `<option value="${o.id}"${o.id === app.org.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div>` : '';
  const centers = (app.s.centers || []).filter(c => c.active);
  const centerSel = centers.length > 1 && !app.isTeacher ? `<div class="org-switch"><select data-change="switchCenter" aria-label="Filtrer par site"><option value="">Tous les sites</option>${centers.map(c => `<option value="${c.id}"${c.id === app.centerId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : '';
  const brand = `<div class="brand"><span class="brand-mark">${LOGO}</span><span class="brand-text">${esc(cfg.APP_NAME || 'Daftar')}</span></div>`;
  let collapsed = false; try { collapsed = localStorage.getItem('daftar-collapsed') === '1'; } catch { /* ignore */ }
  const roleLabel = { owner: 'Admin (propriétaire)', admin: 'Admin', staff: 'Employé', teacher: 'Enseignant' }[app.role];
  const left = L.daysLeft(app.org);
  let banner = '';
  if (app.DEMO) banner += `<div class="banner info">${icon('book')}<span>Mode démo — données fictives enregistrées dans ce navigateur.</span>
      <select data-change="demoRole" class="btn sm" aria-label="Rôle de démonstration">${['owner', 'staff', 'teacher'].map(r => `<option value="${r}"${app.role === r ? ' selected' : ''}>Voir comme : ${{ owner: 'Admin', staff: 'Employé', teacher: 'Enseignant' }[r]}</option>`).join('')}</select>
      <button class="btn sm" data-act="demoReset">Réinitialiser</button></div>`;
  if (!app.active) banner += `<div class="banner bad">${icon('alert')}<span>Abonnement expiré : lecture seule. Renouvelez pour continuer à travailler.</span>${app.isManager ? '<a class="btn sm" href="#/billing">Renouveler</a>' : ''}</div>`;
  else if (app.org.plan === 'trial' && left !== null && left <= 15) banner += `<div class="banner warn">${icon('clock')}<span>Essai gratuit : ${left} jour(s) restant(s).</span>${app.isManager ? '<a class="btn sm" href="#/billing">Choisir un plan</a>' : ''}</div>`;
  return `<div class="app${collapsed ? ' collapsed' : ''}" id="shell">
    <aside class="sidebar"><div class="side-head">${brand}<button class="collapse-btn" data-act="collapse" title="Réduire / agrandir le menu" aria-label="Réduire le menu">${icon('chevL')}</button></div>${orgOpts}${centerSel}${nav(app, current)}
      <div class="sidebar-foot">
        <div class="me" title="${esc(app.me?.full_name || app.user?.email)} — ${esc(roleLabel)}"><span class="avatar">${esc(L.initials(app.me?.full_name || app.user?.email))}</span><div class="me-text"><div class="me-name">${esc(app.me?.full_name || app.user?.email)}</div><div class="me-role">${esc(roleLabel)} · ${esc(app.org.name)}</div></div></div>
        <div class="foot-actions"><button class="btn sm" data-act="theme" title="Thème clair / sombre">${icon('moon')}<span>Thème</span></button><button class="btn sm" data-act="logout" title="Déconnexion">${icon('logout')}<span>Quitter</span></button></div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar"><button class="btn ghost icon" data-act="navToggle" aria-label="Menu">${icon('menu')}</button>${brand}</div>
      <div class="page">${banner}${content}</div>
    </div></div>`;
}

// ---------- global events ----------
const globalActions = {
  navToggle: () => document.getElementById('shell')?.classList.toggle('nav-open'),
  collapse() {
    const el = document.getElementById('shell'); const on = !el.classList.contains('collapsed');
    el.classList.toggle('collapsed', on);
    try { localStorage.setItem('daftar-collapsed', on ? '1' : '0'); } catch { /* ignore */ }
  },
  theme() {
    const r = document.documentElement;
    const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('daftar-theme', r.dataset.theme); } catch { /* ignore */ }
  },
  async logout() { await app.api.signOut(); location.hash = ''; location.reload(); },
  demoReset: () => app.api.reset(),
};
const globalChanges = {
  switchOrg(el) { try { localStorage.setItem('daftar-org', el.value); } catch { /* ignore */ } location.reload(); },
  switchCenter(el) { app.centerId = el.value; app.render(); },
  async demoRole(el) { app.api.setRole(el.value); location.hash = ''; location.reload(); },
};

root.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || !root.contains(el)) {
    if (e.target.closest('.nav a')) document.getElementById('shell')?.classList.remove('nav-open');
    return;
  }
  const name = el.dataset.act;
  const fn = app.view?.actions?.[name] || globalActions[name];
  if (!fn) return;
  e.preventDefault();
  try { await fn(el, app, e); } catch (err) { if (!err.handled) { console.error(err); toast(L.friendlyError(err), 'err'); } }
});
root.addEventListener('change', async e => {
  const el = e.target.closest('[data-change]'); if (!el) return;
  const fn = app.view?.changes?.[el.dataset.change] || globalChanges[el.dataset.change];
  if (fn) { try { await fn(el, app, e); } catch (err) { if (!err.handled) toast(L.friendlyError(err), 'err'); } }
});
root.addEventListener('input', e => {
  const el = e.target.closest('[data-input]'); if (!el) return;
  const fn = app.view?.inputs?.[el.dataset.input]; if (fn) fn(el, app, e);
});
root.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]'); if (!form) return;
  e.preventDefault();
  const fn = app.view?.forms?.[form.dataset.form]; if (!fn) return;
  const btn = form.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
  try { const { formData } = await import('./ui.js'); await fn(formData(form), app, form); }
  catch (err) { if (!err.handled) toast(L.friendlyError(err), 'err'); }
  finally { if (btn) btn.disabled = false; }
});
window.addEventListener('hashchange', () => app.render());

// ---------- auth screens ----------
function authShell(inner) {
  return `<div class="auth">
    <div class="auth-side">
      <div class="brand" style="color:inherit"><span class="brand-mark">${LOGO}</span><span class="brand-text">${esc(cfg.APP_NAME || 'Daftar')}</span></div>
      <div><h1>Toute la gestion de votre centre, au même endroit.</h1>
        <ul style="margin-top:24px">${['Élèves, groupes et inscriptions', 'Emploi du temps et présences', 'Factures et paiements en espèces', 'Relances WhatsApp prêtes à envoyer', 'Paie des enseignants et dépenses']
          .map(t => `<li>${icon('check')}${t}</li>`).join('')}</ul></div>
      <div class="small" style="opacity:.8">Centres de soutien scolaire, de langues et de formation au Maroc.</div>
    </div>
    <div class="auth-main"><div class="auth-card">${inner}</div></div></div>`;
}

function showLogin(mode = 'login', msg = '') {
  const titles = { login: ['Connexion', 'Accédez à votre centre.'], signup: ['Créer un compte', '15 jours d\'essai gratuit, sans engagement.'], forgot: ['Mot de passe oublié', 'Recevez un lien de réinitialisation par e-mail.'] };
  const [t, sub] = titles[mode];
  root.innerHTML = authShell(`<h1>${t}</h1><p class="muted">${sub}</p>${msg ? `<div class="banner info" style="margin-top:12px">${esc(msg)}</div>` : ''}
    <form id="auth-form">
      ${mode === 'signup' ? field('Nom complet', input('full_name', '', { required: true })) : ''}
      ${field('E-mail', input('email', '', { type: 'email', required: true }))}
      ${mode !== 'forgot' ? field('Mot de passe', input('password', '', { type: 'password', required: true, placeholder: mode === 'signup' ? '8 caractères minimum' : '' })) : ''}
      <button class="btn primary" type="submit">${mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}</button>
    </form>
    <div class="small" style="margin-top:16px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
      ${mode !== 'login' ? '<a href="#" data-mode="login">Déjà un compte ? Se connecter</a>' : '<a href="#" data-mode="signup">Créer un compte</a><a href="#" data-mode="forgot">Mot de passe oublié ?</a>'}
    </div>
    <p class="small muted" style="margin-top:24px">Vous voulez juste voir l'application ? <a href="?demo">Ouvrir la démo</a></p>`);
  root.querySelectorAll('[data-mode]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); showLogin(a.dataset.mode); }));
  root.querySelector('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      if (mode === 'login') { await app.api.signIn(f.email.trim(), f.password); await boot(); }
      else if (mode === 'signup') {
        if (f.password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
        const r = await app.api.signUp(f.email.trim(), f.password, { full_name: f.full_name.trim() });
        if (r.session) await boot(); else showLogin('login', 'Compte créé. Confirmez votre e-mail via le lien reçu, puis connectez-vous.');
      } else { await app.api.resetPassword(f.email.trim()); showLogin('login', 'Si un compte existe, un lien de réinitialisation a été envoyé.'); }
    } catch (err) { toast(L.friendlyError(err), 'err'); btn.disabled = false; }
  });
}

function showOnboarding(pending = []) {
  const name = app.user.user_metadata?.full_name || '';
  root.innerHTML = authShell(`
    <h1>Bienvenue${name ? ', ' + esc(name.split(' ')[0]) : ''}</h1>
    ${pending.length ? `<div class="banner warn" style="margin-top:12px">${icon('clock')}<span>Demande envoyée à ${esc(pending.map(p => p.org_name || 'votre centre').join(', '))}. Le responsable doit l'approuver.</span><button class="btn sm" id="ob-refresh">Actualiser</button></div>` : '<p class="muted">Créez votre centre ou rejoignez une équipe existante.</p>'}
    <div class="seg" style="margin-top:16px"><button class="on" data-tab="create">Créer mon centre</button><button data-tab="join">Rejoindre une équipe</button></div>
    <form id="ob-create">
      ${field('Nom du centre', input('name', '', { required: true, placeholder: 'Ex. Centre Al Amal' }))}
      ${field('Ville', input('city', '', { placeholder: 'Rabat, Salé, Kénitra…' }))}
      ${field('Téléphone', input('phone', '', { placeholder: '06…' }))}
      ${field('Votre nom', input('full_name', name, { required: true }))}
      <button class="btn primary" type="submit">Créer et commencer l'essai</button>
    </form>
    <form id="ob-join" class="hidden">
      ${field("Code d'équipe", input('code', '', { required: true, placeholder: 'Donné par le responsable' }))}
      ${field('Votre nom', input('full_name', name, { required: true }))}
      ${field('Téléphone', input('phone', ''))}
      ${field('Je suis', select('role', [{ value: 'staff', label: 'Employé (accueil, secrétariat)' }, { value: 'teacher', label: 'Enseignant(e)' }], 'staff'))}
      <button class="btn primary" type="submit">Envoyer la demande</button>
    </form>
    <p class="small" style="margin-top:20px"><a href="#" id="ob-logout">Se déconnecter</a></p>`);
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    root.querySelector('#ob-create').classList.toggle('hidden', b.dataset.tab !== 'create');
    root.querySelector('#ob-join').classList.toggle('hidden', b.dataset.tab !== 'join');
  }));
  root.querySelector('#ob-refresh')?.addEventListener('click', () => boot());
  root.querySelector('#ob-logout').addEventListener('click', async e => { e.preventDefault(); await app.api.signOut(); location.reload(); });
  const submit = (id, fn) => root.querySelector(id).addEventListener('submit', async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await fn(f); } catch (err) { toast(L.friendlyError(err), 'err'); btn.disabled = false; }
  });
  submit('#ob-create', async f => {
    if (!f.name.trim()) throw new Error('Le nom du centre est obligatoire.');
    const id = await app.api.rpc('ctr_create_organization', { p_name: f.name.trim(), p_city: f.city.trim() || null, p_phone: f.phone.trim() || null, p_full_name: f.full_name.trim() });
    try { localStorage.setItem('daftar-org', id); } catch { /* ignore */ }
    location.hash = '#/settings'; await boot();
  });
  submit('#ob-join', async f => {
    await app.api.rpc('ctr_join_organization', { p_code: f.code, p_full_name: f.full_name.trim(), p_phone: f.phone.trim() || null, p_role: f.role });
    await boot();
  });
}

async function askNewPassword() {
  await modal({ title: 'Nouveau mot de passe', body: field('Mot de passe', input('password', '', { type: 'password', required: true, placeholder: '8 caractères minimum' })),
    onSubmit: async d => { if (d.password.length < 8) throw new Error('8 caractères minimum.'); await app.api.updatePassword(d.password); toast('Mot de passe mis à jour.'); } });
}

// ---------- boot ----------
async function boot() {
  root.innerHTML = '<div class="empty" style="padding-top:30vh">Chargement…</div>';
  try {
    const session = await app.api.session();
    if (!session) return showLogin();
    app.user = session.user;
    const mem = await app.api.list('ctr_members', { eq: { user_id: app.user.id } });
    const orgs = await app.api.list('ctr_organizations');
    const orgMap = new Map(orgs.map(o => [o.id, o]));
    app.memberships = mem.filter(m => m.status === 'active' && orgMap.has(m.org_id));
    app.orgs = app.memberships.map(m => orgMap.get(m.org_id));
    if (!app.memberships.length) return showOnboarding(mem.filter(m => m.status === 'pending'));
    let saved = null; try { saved = localStorage.getItem('daftar-org'); } catch { /* ignore */ }
    app.me = app.memberships.find(m => m.org_id === saved) || app.memberships[0];
    app.org = orgMap.get(app.me.org_id);
    app.role = app.me.role;
    if (!app.DEMO) app.platformAdmin = (await app.api.list('ctr_platform_admins', { eq: { user_id: app.user.id } }).catch(() => [])).length > 0;
    await app.load();
    if (app.isTeacher) {
      const own = (app.s.members || []).find(m => m.user_id === app.user.id); if (own) app.me = own;
      app.derive();
    }
    await app.autoInvoices();
    await app.loadSessions(L.addDays(L.today(), -62), L.addDays(L.today(), 35), true);
    app.render();
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="page"><div class="banner bad">${icon('alert')}<span>Impossible de charger : ${esc(L.friendlyError(e))}</span><button class="btn sm" onclick="location.reload()">Réessayer</button></div></div>`;
  }
}

try { const t = localStorage.getItem('daftar-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }
app.api.onAuth((ev) => { if (ev === 'PASSWORD_RECOVERY') askNewPassword(); });
window.daftar = app; // handy for support/debugging in the console
boot();

// Data access layer: one small interface, two adapters (Supabase and in-browser demo).
import { PLANS } from './logic.js';

const PAGE = 1000;

function applyFilters(q, f = {}) {
  for (const [k, v] of Object.entries(f.eq || {})) q = v === null ? q.is(k, null) : q.eq(k, v);
  for (const [k, v] of Object.entries(f.gte || {})) q = q.gte(k, v);
  for (const [k, v] of Object.entries(f.lte || {})) q = q.lte(k, v);
  for (const [k, v] of Object.entries(f.in || {})) q = q.in(k, v);
  return q;
}
function err(e) { const x = new Error(e.message || String(e)); x.code = e.code; x.details = e.details; return x; }

export function supabaseApi(cfg) {
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'daftar-auth' },
  });
  return {
    mode: 'live',
    client: sb,
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuth(cb) { sb.auth.onAuthStateChange((ev, s) => cb(ev, s)); },
    async signIn(email, password) { const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw err(error); return data; },
    async signUp(email, password, meta) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { ...meta, app: 'daftar' }, emailRedirectTo: location.origin + location.pathname } });
      if (error) throw err(error); return data;
    },
    async resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw err(error); },
    async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw err(error); },
    async signOut() { await sb.auth.signOut(); },

    async list(table, f = {}) {
      const out = [];
      for (let from = 0; ; from += PAGE) {
        let q = applyFilters(sb.from(table).select(f.select || '*'), f);
        if (f.order) for (const o of [].concat(f.order)) { const [c, dir] = o.split(' '); q = q.order(c, { ascending: dir !== 'desc' }); }
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) throw err(error);
        out.push(...data);
        if (data.length < PAGE) break;
      }
      return out;
    },
    async insert(table, rows, opt = {}) {
      let q = opt.onConflict
        ? sb.from(table).upsert(rows, { onConflict: opt.onConflict, ignoreDuplicates: !!opt.ignoreDuplicates })
        : sb.from(table).insert(rows);
      const { data, error } = await q.select();
      if (error) throw err(error);
      return data;
    },
    async update(table, match, patch) {
      const { data, error } = await applyFilters(sb.from(table).update(patch), { eq: match }).select();
      if (error) throw err(error);
      if (!data.length) throw new Error('row-level security: aucune ligne modifiée');
      return data;
    },
    async remove(table, match) {
      const { error } = await applyFilters(sb.from(table).delete(), { eq: match });
      if (error) throw err(error);
    },
    async rpc(name, args = {}) { const { data, error } = await sb.rpc(name, args); if (error) throw err(error); return data; },
  };
}

// ---------------------------------------------------------------------------
// Demo adapter: everything in memory (persisted in this browser when possible)
// ---------------------------------------------------------------------------
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
const KEYS = { ctr_attendance: ['session_id', 'student_id'], ctr_settings: ['org_id'] };
const DEFAULTS = {
  ctr_students: { status: 'active' }, ctr_enrollments: { status: 'active' }, ctr_groups: { active: true },
  ctr_sessions: { status: 'scheduled' }, ctr_waitlist: { status: 'waiting' }, ctr_invoices: { cancelled: false },
  ctr_payments: { method: 'cash' }, ctr_teachers: { active: true, subject_ids: [], pay_type: 'per_session', pay_rate: 0 },
  ctr_centers: { active: true }, ctr_teacher_payouts: { status: 'pending' }, ctr_members: { status: 'pending', role: 'staff' },
};
const STORE_KEY = 'daftar-demo-v1';

export function demoApi(seed) {
  let db;
  try { db = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { db = null; }
  if (!db || !db.ctr_organizations) db = seed();
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } };
  save();
  const tbl = t => (db[t] ||= []);
  const keyOf = (t, r) => (KEYS[t] || ['id']).map(k => r[k]).join('|');
  const match = (r, f = {}) =>
    Object.entries(f.eq || {}).every(([k, v]) => (r[k] ?? null) === v) &&
    Object.entries(f.gte || {}).every(([k, v]) => r[k] >= v) &&
    Object.entries(f.lte || {}).every(([k, v]) => r[k] <= v) &&
    Object.entries(f.in || {}).every(([k, v]) => v.includes(r[k]));
  const clone = x => JSON.parse(JSON.stringify(x));
  const user = db.__user;

  function checkLimits(t, row) {
    const org = tbl('ctr_organizations').find(o => o.id === row.org_id); if (!org) return;
    const p = PLANS[org.plan] || PLANS.trial;
    if (t === 'ctr_students' && row.status === 'active') {
      const lim = org.max_students ?? p.students;
      if (lim && tbl(t).filter(s => s.org_id === row.org_id && s.status === 'active' && s.id !== row.id).length >= lim)
        throw new Error(`PLAN_LIMIT_STUDENTS: votre plan autorise ${lim} élèves actifs.`);
    }
    if (t === 'ctr_centers') {
      const lim = org.max_centers ?? p.centers;
      if (lim && tbl(t).filter(c => c.org_id === row.org_id && c.active && c.id !== row.id).length >= lim)
        throw new Error(`PLAN_LIMIT_CENTERS: votre plan autorise ${lim} centre(s).`);
    }
  }

  const api = {
    mode: 'demo',
    async session() { return { user }; },
    onAuth() {},
    async signIn() { return { user }; }, async signUp() { return { user }; },
    async resetPassword() {}, async updatePassword() {},
    async signOut() { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } location.reload(); },

    async list(t, f = {}) {
      let rows = tbl(t).filter(r => match(r, f));
      if (f.order) {
        const os = [].concat(f.order).map(o => o.split(' '));
        rows = rows.slice().sort((a, b) => { for (const [c, d] of os) { if (a[c] < b[c]) return d === 'desc' ? 1 : -1; if (a[c] > b[c]) return d === 'desc' ? -1 : 1; } return 0; });
      }
      return clone(rows);
    },
    async insert(t, rows, opt = {}) {
      const out = [];
      const conflictCols = opt.onConflict ? opt.onConflict.split(',') : null;
      for (const raw of [].concat(rows)) {
        const row = { ...(DEFAULTS[t] || {}), ...raw };
        if (!KEYS[t]) row.id ||= uuid();
        row.created_at ||= new Date().toISOString();
        if (conflictCols) {
          const ex = tbl(t).find(r => conflictCols.every(c => (r[c] ?? null) === (row[c] ?? null)) && conflictCols.every(c => row[c] != null));
          if (ex) { if (!opt.ignoreDuplicates) { Object.assign(ex, raw); out.push(clone(ex)); } continue; }
        } else if (tbl(t).some(r => keyOf(t, r) === keyOf(t, row))) throw new Error('duplicate key');
        if (t === 'ctr_invoices' && row.enrollment_id && row.period_month &&
            tbl(t).some(r => r.enrollment_id === row.enrollment_id && r.period_month === row.period_month)) {
          if (opt.ignoreDuplicates) continue; throw new Error('duplicate key');
        }
        checkLimits(t, row);
        if (t === 'ctr_invoices' && row.number == null) {
          const org = tbl('ctr_organizations').find(o => o.id === row.org_id); org.invoice_seq = (org.invoice_seq || 0) + 1; row.number = org.invoice_seq;
          row.issued_at ||= new Date().toISOString();
        }
        tbl(t).push(row); out.push(clone(row));
      }
      save(); return out;
    },
    async update(t, m, patch) {
      const rows = tbl(t).filter(r => match(r, { eq: m }));
      if (!rows.length) throw new Error('row-level security: aucune ligne modifiée');
      for (const r of rows) { if (t === 'ctr_students' && patch.status === 'active' && r.status !== 'active') checkLimits(t, { ...r, ...patch }); Object.assign(r, patch); }
      save(); return clone(rows);
    },
    async remove(t, m) {
      const before = tbl(t).length; db[t] = tbl(t).filter(r => !match(r, { eq: m }));
      // minimal cascades for the demo
      if (db[t].length !== before) {
        const ids = new Set(); // not tracked precisely; cascade by common FKs
        if (t === 'ctr_students' && m.id) for (const c of ['ctr_enrollments', 'ctr_invoices', 'ctr_payments', 'ctr_attendance', 'ctr_reminder_log']) db[c] = tbl(c).filter(r => r.student_id !== m.id);
        if (t === 'ctr_groups' && m.id) for (const c of ['ctr_enrollments', 'ctr_group_slots', 'ctr_sessions']) db[c] = tbl(c).filter(r => r.group_id !== m.id);
        if (t === 'ctr_invoices' && m.id) db.ctr_payments = tbl('ctr_payments').filter(r => r.invoice_id !== m.id);
        if (t === 'ctr_sessions' && m.id) db.ctr_attendance = tbl('ctr_attendance').filter(r => r.session_id !== m.id);
        void ids;
      }
      save();
    },
    async rpc(name, a = {}) {
      if (name === 'ctr_create_organization') {
        const id = uuid();
        tbl('ctr_organizations').push({ id, name: a.p_name, city: a.p_city, phone: a.p_phone, plan: 'trial',
          plan_ends_at: new Date(Date.now() + 15 * 864e5).toISOString(), join_code: Math.random().toString(36).slice(2, 8).toUpperCase(), invoice_seq: 0, created_at: new Date().toISOString() });
        tbl('ctr_settings').push({ ...clone(db.ctr_settings[0]), org_id: id });
        tbl('ctr_centers').push({ id: uuid(), org_id: id, name: a.p_name, city: a.p_city, active: true });
        tbl('ctr_members').push({ id: uuid(), org_id: id, user_id: user.id, full_name: a.p_full_name, email: user.email, role: 'owner', status: 'active' });
        save(); return id;
      }
      if (name === 'ctr_join_organization') {
        const org = tbl('ctr_organizations').find(o => o.join_code === String(a.p_code).trim().toUpperCase());
        if (!org) throw new Error('Code invalide.');
        return org.id;
      }
      if (name === 'ctr_regenerate_join_code') {
        const org = tbl('ctr_organizations').find(o => o.id === a.p_org); org.join_code = Math.random().toString(36).slice(2, 8).toUpperCase(); save(); return org.join_code;
      }
      if (name === 'ctr_admin_list_orgs') {
        return tbl('ctr_organizations').map(o => ({ ...o, owner_email: (tbl('ctr_members').find(m => m.org_id === o.id && m.role === 'owner') || {}).email,
          students: tbl('ctr_students').filter(s => s.org_id === o.id && s.status === 'active').length,
          centers: tbl('ctr_centers').filter(c => c.org_id === o.id && c.active).length }));
      }
      throw new Error('RPC inconnue: ' + name);
    },
    // demo-only helpers
    setRole(role) { const m = tbl('ctr_members').find(x => x.user_id === user.id); m.role = role; if (role === 'teacher') m.teacher_id = tbl('ctr_teachers')[0].id; save(); },
    reset() { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } location.reload(); },
  };
  return api;
}

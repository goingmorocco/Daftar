// Pure business logic — no DOM, no network. Shared by the app, the demo and the tests.

export const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
export const MONTHS_SHORT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
export const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAYS_SHORT = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ---------- Dates (all ISO yyyy-mm-dd strings, local time) ----------
const pad = n => String(n).padStart(2, '0');
export function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parse(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function today() { return iso(new Date()); }
export function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
export function addMonths(s, n) { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth() + n, 1)); }
export function monthStart(s) { return String(s).slice(0, 7) + '-01'; }
export function monthEnd(s) { const d = parse(monthStart(s)); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
export function isoWeekday(s) { const w = parse(s).getDay(); return w === 0 ? 7 : w; }
export function weekStart(s) { return addDays(s, 1 - isoWeekday(s)); }
export function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
export function monthLabel(s, short = false) {
  const d = parse(monthStart(s)); const m = MONTHS[d.getMonth()];
  return short ? m.slice(0, 4).replace(/\.$/, '') + (m.length > 4 ? '.' : '') : `${m} ${d.getFullYear()}`;
}
export function fmtDate(s, withYear = true) {
  if (!s) return '—';
  const d = parse(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${withYear ? '/' + d.getFullYear() : ''}`;
}
export function fmtTime(t) { return t ? String(t).slice(0, 5) : ''; }
export function hoursBetween(a, b) {
  const [h1, m1] = String(a).split(':').map(Number); const [h2, m2] = String(b).split(':').map(Number);
  return Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
}

// ---------- Money ----------
export function money(n, cur = 'DH') {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const s = v.toLocaleString('fr-FR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }).replace(/ /g, ' ');
  return `${s} ${cur}`;
}
export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

// ---------- Invoices ----------
export const STATUS_LABEL = { paid: 'Payée', partial: 'Partielle', pending: 'En attente', overdue: 'En retard', cancelled: 'Annulée' };
export const STATUS_RANK = { overdue: 4, partial: 3, pending: 2, paid: 1, cancelled: 0 };

export function invoiceStatus(inv, paid, graceDays, on = today()) {
  if (inv.cancelled) return 'cancelled';
  const amount = Number(inv.amount) || 0;
  if (paid >= amount - 0.005) return 'paid';
  if (on > addDays(inv.due_date, graceDays || 0)) return 'overdue';
  return paid > 0 ? 'partial' : 'pending';
}

/** Enrich invoices with paid, remaining and status. Returns { invoices, byStudent, paidByInvoice }. */
export function computeFinance(invoices, payments, graceDays, on = today()) {
  const paidByInvoice = new Map();
  for (const p of payments) if (p.invoice_id) paidByInvoice.set(p.invoice_id, round2((paidByInvoice.get(p.invoice_id) || 0) + Number(p.amount)));
  const rows = invoices.map(inv => {
    const paid = paidByInvoice.get(inv.id) || 0;
    const status = invoiceStatus(inv, paid, graceDays, on);
    return { ...inv, paid, remaining: status === 'cancelled' ? 0 : round2(Math.max(0, Number(inv.amount) - paid)), status };
  });
  const byStudent = new Map();
  for (const r of rows) {
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, []);
    byStudent.get(r.student_id).push(r);
  }
  return { invoices: rows, byStudent, paidByInvoice };
}

/** Worst open status for a student (for the student list chip). */
export function studentPaymentStatus(rows = []) {
  let worst = null;
  for (const r of rows) {
    if (r.status === 'cancelled') continue;
    if (!worst || STATUS_RANK[r.status] > STATUS_RANK[worst]) worst = r.status;
  }
  return worst || 'none';
}

/** KPIs over a period [from, to] (inclusive). */
export function periodKpis({ invoices, payments, expenses, payouts }, from, to) {
  const inRange = d => d && d >= from && d <= to;
  const billedRows = invoices.filter(i => !i.cancelled && inRange(String(i.period_month || i.due_date).slice(0, 10)));
  const billed = round2(billedRows.reduce((s, i) => s + Number(i.amount), 0));
  const collected = round2(payments.filter(p => inRange(p.paid_at)).reduce((s, p) => s + Number(p.amount), 0));
  const pending = round2(invoices.filter(i => i.status === 'pending' || i.status === 'partial').reduce((s, i) => s + i.remaining, 0));
  const overdue = round2(invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.remaining, 0));
  const spent = round2(expenses.filter(e => inRange(e.spent_at)).reduce((s, e) => s + Number(e.amount), 0)
    + (payouts || []).filter(p => p.status === 'paid' && inRange(p.paid_at)).reduce((s, p) => s + Number(p.amount), 0));
  return { billed, collected, pending, overdue, spent, net: round2(collected - spent) };
}

// ---------- Generation ----------
/** Sessions that should exist between from..to for the given groups and slots. */
export function plannedSessions(groups, slots, from, to) {
  const out = [];
  const byGroup = new Map(groups.filter(g => g.active).map(g => [g.id, g]));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = isoWeekday(d);
    for (const s of slots) {
      if (s.weekday !== wd) continue;
      const g = byGroup.get(s.group_id);
      if (!g) continue;
      if (g.start_date && d < g.start_date) continue;
      if (g.end_date && d > g.end_date) continue;
      out.push({ org_id: g.org_id, group_id: g.id, date: d, start_time: fmtTime(s.start_time), end_time: fmtTime(s.end_time),
                 teacher_id: g.teacher_id || null, room_id: s.room_id || g.room_id || null, status: 'scheduled' });
    }
  }
  return out;
}

/** Monthly invoices to create for `month` (any date inside it). Skips existing (enrollment_id, period_month). */
export function plannedInvoices(enrollments, groups, existing, month) {
  const ms = monthStart(month), me = monthEnd(month);
  const have = new Set(existing.filter(i => i.enrollment_id && i.period_month).map(i => i.enrollment_id + '|' + String(i.period_month).slice(0, 10)));
  const gName = new Map(groups.map(g => [g.id, g.name]));
  const out = [];
  for (const e of enrollments) {
    if (e.status !== 'active') continue;
    if (e.start_date > me) continue;
    if (e.end_date && e.end_date < ms) continue;
    if (!(Number(e.monthly_price) > 0)) continue;
    if (have.has(e.id + '|' + ms)) continue;
    out.push({ org_id: e.org_id, student_id: e.student_id, enrollment_id: e.id, period_month: ms,
               description: `${gName.get(e.group_id) || 'Cours'} — ${monthLabel(ms)}`,
               amount: Number(e.monthly_price), due_date: e.start_date > ms ? e.start_date : ms });
  }
  return out;
}

/** Price for a level+subject pair from the price grid. */
export function priceFor(prices, levelId, subjectId) {
  const p = prices.find(x => x.level_id === levelId && x.subject_id === subjectId);
  return p ? Number(p.monthly_price) : null;
}

// ---------- Teacher payroll ----------
export const PAY_LABEL = { per_session: 'Par séance', per_hour: "À l'heure", monthly: 'Mensuel fixe', percent: '% des encaissements' };
export function payrollFor(teacher, { sessions, groups, payments, invoices, enrollments }, month, on = today()) {
  const ms = monthStart(month), me = monthEnd(month);
  const mine = sessions.filter(s => s.teacher_id === teacher.id && s.date >= ms && s.date <= me && s.date <= on && s.status !== 'cancelled');
  const hours = round2(mine.reduce((h, s) => h + hoursBetween(s.start_time, s.end_time), 0));
  const rate = Number(teacher.pay_rate) || 0;
  let amount = 0, basis = '';
  if (teacher.pay_type === 'per_session') { amount = mine.length * rate; basis = `${mine.length} séance(s) × ${money(rate)}`; }
  else if (teacher.pay_type === 'per_hour') { amount = hours * rate; basis = `${hours} h × ${money(rate)}`; }
  else if (teacher.pay_type === 'monthly') { amount = rate; basis = 'Montant fixe'; }
  else if (teacher.pay_type === 'percent') {
    const myGroups = new Set(groups.filter(g => g.teacher_id === teacher.id).map(g => g.id));
    const myEnroll = new Set(enrollments.filter(e => myGroups.has(e.group_id)).map(e => e.id));
    const myInv = new Set(invoices.filter(i => i.enrollment_id && myEnroll.has(i.enrollment_id)).map(i => i.id));
    const collected = payments.filter(p => p.invoice_id && myInv.has(p.invoice_id) && p.paid_at >= ms && p.paid_at <= me)
      .reduce((s, p) => s + Number(p.amount), 0);
    amount = collected * rate / 100; basis = `${rate} % de ${money(collected)}`;
  }
  return { sessions: mine.length, hours, amount: round2(amount), basis };
}

// ---------- WhatsApp ----------
export function normalizePhone(p) {
  let s = String(p || '').replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('0') && s.length === 10) s = '212' + s.slice(1);
  if (/^[5-7]\d{8}$/.test(s)) s = '212' + s;
  return s;
}
export function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null && vars[k] !== '' ? vars[k] : m));
}
export function waLink(phone, text) {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** Build the day's reminder list. */
export function buildReminders({ invoices, enrollments, students, groups, reminderLog, settings, orgName }, on = today()) {
  const st = new Map(students.map(s => [s.id, s]));
  const enr = new Map(enrollments.map(e => [e.id, e]));
  const gr = new Map(groups.map(g => [g.id, g]));
  const sentToday = new Set(reminderLog.filter(r => r.sent_at && iso(new Date(r.sent_at)) === on).map(r => r.kind + '|' + (r.invoice_id || r.enrollment_id)));
  const grace = settings.late_grace_days || 0;
  const out = [];
  const varsFor = (s, g, extra) => ({ parent: s.parent_name || s.full_name, eleve: s.full_name, groupe: g ? g.name : '', centre: orgName, ...extra });
  for (const i of invoices) {
    const s = st.get(i.student_id); if (!s || s.status !== 'active') continue;
    const e = i.enrollment_id ? enr.get(i.enrollment_id) : null; const g = e ? gr.get(e.group_id) : null;
    const base = { mois: i.period_month ? monthLabel(i.period_month) : (i.description || ''), montant: money(i.amount).replace(' DH', ''), reste: money(i.remaining).replace(' DH', '') };
    if (i.status === 'overdue') {
      out.push({ kind: 'unpaid', key: 'unpaid|' + i.id, student: s, group: g, invoice: i, enrollment: e, phone: s.parent_phone || s.phone,
                 days: daysBetween(i.due_date, on), sent: sentToday.has('unpaid|' + i.id),
                 text: fillTemplate(settings.tpl_unpaid, varsFor(s, g, { ...base, date: fmtDate(i.due_date) })) });
    } else if (i.status === 'pending' || i.status === 'partial') {
      const deadline = addDays(i.due_date, grace);
      if (daysBetween(on, deadline) <= 3) {
        out.push({ kind: 'soon', key: 'soon|' + i.id, student: s, group: g, invoice: i, enrollment: e, phone: s.parent_phone || s.phone,
                   days: daysBetween(on, deadline), sent: sentToday.has('soon|' + i.id),
                   text: fillTemplate(settings.tpl_soon, varsFor(s, g, { ...base, date: fmtDate(deadline) })) });
      }
    }
  }
  for (const e of enrollments) {
    if (e.status !== 'active' || !e.end_date) continue;
    const left = daysBetween(on, e.end_date);
    if (left < -7 || left > 7) continue;
    const s = st.get(e.student_id); if (!s || s.status !== 'active') continue;
    const g = gr.get(e.group_id);
    out.push({ kind: 'renewal', key: 'renewal|' + e.id, student: s, group: g, enrollment: e, phone: s.parent_phone || s.phone,
               days: left, sent: sentToday.has('renewal|' + e.id),
               text: fillTemplate(settings.tpl_renewal, varsFor(s, g, { date: fmtDate(e.end_date) })) });
  }
  return out.sort((a, b) => (a.sent - b.sent) || (b.days - a.days));
}

// ---------- Waiting list ----------
export function waitlistAlerts(waitlist, threshold) {
  const counts = new Map();
  for (const w of waitlist) {
    if (w.status !== 'waiting') continue;
    const k = (w.level_id || '') + '|' + (w.subject_id || '');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= threshold)
    .map(([k, n]) => { const [level_id, subject_id] = k.split('|'); return { level_id: level_id || null, subject_id: subject_id || null, count: n }; });
}

// ---------- Plans ----------
export const PLANS = {
  trial:      { label: 'Essai gratuit', price: 0,   students: 500, centers: 3 },
  starter:    { label: 'Starter',       price: 199, students: 150, centers: 1 },
  growth:     { label: 'Growth',        price: 399, students: 500, centers: 3 },
  enterprise: { label: 'Enterprise',    price: null, students: null, centers: null },
};
export function planLimits(org) {
  const p = PLANS[org.plan] || PLANS.trial;
  return { students: org.max_students ?? p.students, centers: org.max_centers ?? p.centers };
}
export function planActive(org, now = new Date()) {
  return !org.plan_ends_at || new Date(org.plan_ends_at) > now;
}
export function daysLeft(org, now = new Date()) {
  if (!org.plan_ends_at) return null;
  return Math.ceil((new Date(org.plan_ends_at) - now) / 86400000);
}

// ---------- Misc ----------
export function initials(name) {
  return String(name || '?').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
export function normalize(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
export function matches(q, ...fields) { const n = normalize(q).trim(); return !n || fields.some(f => normalize(f).includes(n)); }
export function friendlyError(e) {
  const m = String(e && (e.message || e.error_description || e) || 'Erreur');
  if (m.includes('PLAN_LIMIT_STUDENTS')) return m.replace('PLAN_LIMIT_STUDENTS: ', 'Limite atteinte : ') + ' Passez à un plan supérieur.';
  if (m.includes('PLAN_LIMIT_CENTERS')) return m.replace('PLAN_LIMIT_CENTERS: ', 'Limite atteinte : ') + ' Passez à un plan supérieur.';
  if (m.includes('row-level security')) return "Action non autorisée pour votre rôle (ou abonnement expiré).";
  if (m.includes('Invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('Email not confirmed')) return "Confirmez d'abord votre e-mail (lien reçu par e-mail).";
  if (m.includes('User already registered')) return 'Un compte existe déjà avec cet e-mail. Connectez-vous.';
  if (m.includes('duplicate key')) return 'Cet élément existe déjà.';
  return m;
}

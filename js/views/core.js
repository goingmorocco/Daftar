// Dashboard, students, groups.
import { esc, icon, modal, field, input, select, textarea, opts, nullIfEmpty, num, toast, emptyState, confirmBox } from '../ui.js';
import * as L from '../logic.js';
import { statusBadge, invBadge, invNo, groupChip, groupLabel, groupPrice, studentDialog, enrollDialog, paymentDialog, invoiceDialog, receiptDialog, METHOD, exportCsv } from './common.js';

const today = () => L.today();
const pageHead = (title, sub, actions = '') => `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="actions">${actions}</div></div>`;
const kpi = (label, value, cls = '', dot = '') => `<div class="kpi ${cls}"><div class="label">${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}${esc(label)}</div><div class="value">${value}</div></div>`;
export { pageHead, kpi };

export function moneyKpis(app, from, to) {
  const k = L.periodKpis({ invoices: app.fin.invoices, payments: app.s.payments, expenses: app.s.expenses, payouts: app.s.payouts }, from, to);
  const m = v => `${L.money(v, '').trim()}<small>${esc(app.cur)}</small>`;
  return `<div class="kpis">
    ${kpi('Facturé', m(k.billed), '', 'var(--info)')}${kpi('Encaissé', m(k.collected), 'ok', 'var(--ok)')}
    ${kpi('En attente', m(k.pending), '', 'var(--warn)')}${kpi('En retard', m(k.overdue), k.overdue ? 'bad' : '', 'var(--bad)')}
    ${kpi('Dépenses', m(k.spent), '', 'var(--accent)')}${kpi('Net', m(k.net), k.net < 0 ? 'bad' : '', 'var(--primary)')}</div>`;
}

function sessionLine(app, s) {
  const g = app.by('groups', s.group_id); if (!g) return '';
  return `<div class="list-item"><div style="width:6px;align-self:stretch;border-radius:3px;background:${esc(g.color || 'var(--primary)')}"></div>
    <div class="grow"><div class="cell-main">${esc(g.name)}</div><div class="cell-sub">${L.fmtTime(s.start_time)}–${L.fmtTime(s.end_time)} · ${esc(app.name('teachers', s.teacher_id, 'Sans enseignant'))}${s.room_id ? ' · ' + esc(app.name('rooms', s.room_id)) : ''}</div></div>
    ${s.status === 'done' ? '<span class="badge b-paid">Fait</span>' : s.status === 'cancelled' ? '<span class="badge b-cancelled">Annulée</span>' : ''}
    <button class="btn sm" data-act="attendance" data-id="${s.id}">${icon('check')}Présences</button></div>`;
}
export { sessionLine };

// ---------------------------------------------------------------- Dashboard
export const dashboard = {
  title: 'Tableau de bord',
  allow: app => app.isStaff,
  render(app) {
    const t = today(), ms = L.monthStart(t);
    const students = app.s.students.filter(s => s.status === 'active' && app.inCenter(s));
    const groups = app.s.groups.filter(g => g.active && app.inCenter(g));
    const todays = app.s.sessions.filter(s => s.date === t && app.inCenter(app.by('groups', s.group_id) || {})).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const unpaid = app.reminders.filter(r => r.kind === 'unpaid' && !r.sent);
    const alerts = L.waitlistAlerts(app.s.waitlist, app.settings.waitlist_threshold || 7);
    const pending = app.s.members.filter(m => m.status === 'pending');
    // last 6 months collected
    const months = Array.from({ length: 6 }, (_, i) => L.addMonths(ms, i - 5));
    const coll = months.map(m => app.s.payments.filter(p => p.paid_at >= m && p.paid_at <= L.monthEnd(m)).reduce((s, p) => s + Number(p.amount), 0));
    const max = Math.max(1, ...coll);
    const enrolled = new Map();
    for (const e of app.s.enrollments) if (e.status === 'active') enrolled.set(e.group_id, (enrolled.get(e.group_id) || 0) + 1);
    const cap = groups.reduce((s, g) => s + (g.capacity || 0), 0), seats = groups.reduce((s, g) => s + (g.capacity ? Math.min(enrolled.get(g.id) || 0, g.capacity) : 0), 0);
    const first = (app.me?.full_name || '').split(' ')[0];
    const att = (app.s.attendanceRecent || []);
    return `${pageHead(`Bonjour${first ? ' ' + first : ''}`, `${L.DAYS[L.isoWeekday(t)]} ${L.fmtDate(t)} — ${esc(L.monthLabel(t))}`,
      `<button class="btn" data-act="newPayment">${icon('wallet')}Encaisser</button><button class="btn primary" data-act="newStudent">${icon('plus')}Nouvel élève</button>`)}
      ${alerts.map(a => `<div class="banner warn">${icon('alert')}<span>${a.count} demandes en attente pour ${esc(app.name('levels', a.level_id, 'tout niveau'))} · ${esc(app.name('subjects', a.subject_id, 'toute matière'))} — de quoi ouvrir un groupe.</span><a class="btn sm" href="#/waitlist">Voir</a></div>`).join('')}
      ${pending.length && app.isManager ? `<div class="banner info">${icon('team')}<span>${pending.length} demande(s) d'accès à approuver.</span><a class="btn sm" href="#/team">Approuver</a></div>` : ''}
      ${app.isManager ? moneyKpis(app, ms, L.monthEnd(ms)) : `<div class="kpis k4">${kpi('Élèves actifs', String(students.length))}${kpi("Séances aujourd'hui", String(todays.length))}${kpi('Relances à envoyer', String(unpaid.length), unpaid.length ? 'bad' : '')}${kpi("Liste d'attente", String(app.s.waitlist.filter(w => w.status === 'waiting').length))}</div>`}
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Séances du jour</h2><a href="#/schedule" class="small">Emploi du temps →</a></div>
          <div class="list">${todays.length ? todays.map(s => sessionLine(app, s)).join('') : emptyState('Aucune séance aujourd\'hui', 'Les séances se créent à partir des horaires de chaque groupe.', '', 'calendar')}</div></div>
        <div class="card"><div class="card-head"><h2>Relances du jour</h2><a href="#/reminders" class="small">Tout voir →</a></div>
          <div class="list">${unpaid.slice(0, 6).map(r => `<div class="list-item"><div class="grow"><div class="cell-main">${esc(r.student.full_name)}</div><div class="cell-sub">${esc(r.group?.name || r.invoice?.description || '')} · ${r.days} j de retard</div></div>
            <b class="num">${app.money(r.invoice.remaining)}</b>${r.phone ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${L.waLink(r.phone, r.text)}" data-act="logReminder" data-key="${esc(r.key)}">${icon('wa')}</a>` : ''}</div>`).join('')
            || emptyState('Rien à relancer', 'Tous les paiements sont à jour.', '', 'check')}</div></div>
        ${app.isManager ? `<div class="card"><div class="card-head"><h2>Encaissements — 6 derniers mois</h2></div>
          <div class="card-pad"><div class="bars">${months.map((m, i) => `<div class="bar-col"><span class="val">${coll[i] ? Math.round(coll[i] / 100) / 10 + 'k' : ''}</span><div class="bar" style="height:${Math.round(coll[i] / max * 100)}%" title="${esc(app.money(coll[i]))}"></div><span class="lbl">${esc(L.MONTHS_SHORT[L.parse(m).getMonth()])}</span></div>`).join('')}</div></div></div>` : ''}
        <div class="card"><div class="card-head"><h2>Votre centre</h2></div>
          <div class="list">
            <div class="list-item"><div class="grow">Élèves actifs</div><b class="num">${students.length}</b></div>
            <div class="list-item"><div class="grow">Groupes actifs</div><b class="num">${groups.length}</b></div>
            <div class="list-item"><div class="grow">Remplissage des groupes</div><b class="num">${cap ? Math.round(seats / cap * 100) + ' %' : '—'}</b></div>
            <div class="list-item"><div class="grow">Liste d'attente</div><b class="num">${app.s.waitlist.filter(w => w.status === 'waiting').length}</b></div>
            <div class="list-item"><div class="grow">Enseignants</div><b class="num">${app.s.teachers.filter(t => t.active).length}</b></div>
          </div></div>
      </div>${att ? '' : ''}`;
  },
  actions: {
    newStudent: async (el, app) => { const s = await studentDialog(app); if (s?.id) app.go('#/students/' + s.id); },
    async newPayment(el, app) {
      const st = await pickStudent(app, 'Encaisser — choisir l\'élève', s => app.fin.byStudent.get(s.id)?.some(i => i.remaining > 0));
      if (st) await paymentDialog(app, { student: st });
    },
    attendance: (el, app) => import('./schedule.js').then(m => m.attendanceDialog(app, el.dataset.id)),
    logReminder: (el, app) => import('./money.js').then(m => m.logReminder(app, el.dataset.key, el)),
  },
};

export async function pickStudent(app, title, filter = () => true) {
  const list = app.s.students.filter(s => s.status === 'active' && filter(s));
  if (!list.length) { toast('Aucun élève concerné.', 'err'); return null; }
  const id = await modal({ title, body: field('Élève', select('student_id', opts(list.sort((a, b) => a.full_name.localeCompare(b.full_name)), s => `${s.full_name}${s.phone ? ' · ' + s.phone : ''}`), '', { empty: 'Choisir…', required: true })),
    submit: 'Continuer', onSubmit: d => d.student_id });
  return id ? app.by('students', id) : null;
}

// ---------------------------------------------------------------- Students
function studentRows(app) {
  const st = app.viewState;
  const enrBy = new Map();
  for (const e of app.s.enrollments) if (e.status === 'active') { (enrBy.get(e.student_id) || enrBy.set(e.student_id, []).get(e.student_id)).push(e); }
  return app.s.students.filter(s => {
    if (!app.inCenter(s)) return false;
    if ((st.status || 'active') !== 'all' && s.status !== (st.status || 'active')) return false;
    if (st.group && !(enrBy.get(s.id) || []).some(e => e.group_id === st.group)) return false;
    if (st.pay && app.studentStatus.get(s.id) !== st.pay) return false;
    const gnames = (enrBy.get(s.id) || []).map(e => app.name('groups', e.group_id));
    return L.matches(st.q, s.full_name, s.phone, s.parent_name, s.parent_phone, ...gnames);
  }).sort((a, b) => a.full_name.localeCompare(b.full_name)).map(s => ({ s, enr: enrBy.get(s.id) || [] }));
}

export const students = {
  title: 'Élèves',
  allow: app => app.isStaff,
  render(app, r) {
    if (r.id) return studentDetail(app, r.id, r.q.tab || 'enrollments');
    const st = app.viewState;
    const rows = studentRows(app);
    const due = id => (app.fin.byStudent.get(id) || []).reduce((s, i) => s + i.remaining, 0);
    const lim = L.planLimits(app.org);
    const active = app.s.students.filter(s => s.status === 'active').length;
    return `${pageHead('Élèves', `${active} actif(s)${lim.students ? ` sur ${lim.students} inclus dans votre plan` : ''}`,
      `<button class="btn" data-act="exportCsv">${icon('download')}Exporter</button><button class="btn primary" data-act="newStudent">${icon('plus')}Nouvel élève</button>`)}
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input data-input="q" placeholder="Rechercher un nom, un téléphone, un groupe…" value="${esc(st.q || '')}"></div>
          ${select('group', opts(app.s.groups.filter(g => app.inCenter(g))), st.group || '', { empty: 'Tous les groupes' }).replace('<select', '<select data-change="filter"')}
          ${select('pay', [{ value: 'overdue', label: 'En retard' }, { value: 'partial', label: 'Partiel' }, { value: 'pending', label: 'En attente' }, { value: 'paid', label: 'À jour' }, { value: 'none', label: 'Sans facture' }], st.pay || '', { empty: 'Tous les paiements' }).replace('<select', '<select data-change="filter"')}
          ${select('status', [{ value: 'active', label: 'Actifs' }, { value: 'inactive', label: 'Inactifs' }, { value: 'all', label: 'Tous' }], st.status || 'active').replace('<select', '<select data-change="filter"')}
        </div>
        ${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Élève</th><th class="hide-sm">Groupes</th><th>Paiement</th><th class="r">Reste dû</th></tr></thead><tbody>
          ${rows.map(({ s, enr }) => `<tr class="click" data-act="open" data-id="${s.id}">
            <td><div class="cell-main">${esc(s.full_name)}</div><div class="cell-sub">${esc(s.parent_phone || s.phone || '')}${s.parent_name ? ' · ' + esc(s.parent_name) : ''}</div></td>
            <td class="hide-sm"><div class="chips">${enr.map(e => groupChip(app, app.by('groups', e.group_id))).join('') || '<span class="muted small">Aucun groupe</span>'}</div></td>
            <td>${statusBadge(app.studentStatus.get(s.id))}</td>
            <td class="r num">${due(s.id) ? app.money(due(s.id)) : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState(app.s.students.length ? 'Aucun résultat' : 'Aucun élève pour l\'instant', app.s.students.length ? 'Modifiez la recherche ou les filtres.' : 'Ajoutez votre premier élève et inscrivez-le à un groupe.', app.s.students.length ? '' : `<button class="btn primary" data-act="newStudent">${icon('plus')}Nouvel élève</button>`, 'users')}
      </div>`;
  },
  inputs: { q(el, app) { app.viewState.q = el.value; app.rerender(); } },
  changes: { filter(el, app) { app.viewState[el.name] = el.value; app.render(); } },
  actions: {
    open: (el, app) => app.go('#/students/' + el.dataset.id),
    newStudent: async (el, app) => { const s = await studentDialog(app); if (s?.id) app.go('#/students/' + s.id); },
    exportCsv(el, app) {
      exportCsv(`eleves-${today()}.csv`, ['Nom', 'Téléphone', 'Parent', 'Téléphone parent', 'Niveau', 'Groupes', 'Statut paiement', 'Reste dû'],
        studentRows(app).map(({ s, enr }) => [s.full_name, s.phone, s.parent_name, s.parent_phone, app.name('levels', s.level_id, ''),
          enr.map(e => app.name('groups', e.group_id)).join(' / '), L.STATUS_LABEL[app.studentStatus.get(s.id)] || '',
          (app.fin.byStudent.get(s.id) || []).reduce((a, i) => a + i.remaining, 0)]));
    },
    edit: async (el, app) => { await studentDialog(app, app.by('students', el.dataset.id)); },
    enroll: async (el, app) => { await enrollDialog(app, { student: app.by('students', el.dataset.id) }); },
    editEnroll: async (el, app) => { const e = app.s.enrollments.find(x => x.id === el.dataset.id); await enrollDialog(app, { enrollment: e }); },
    async endEnroll(el, app) {
      if (!(await confirmBox('Terminer cette inscription ? Les factures déjà émises restent.', { ok: 'Terminer' }))) return;
      await app.save('ctr_enrollments', { status: 'ended', end_date: today() }, el.dataset.id); toast('Inscription terminée.'); await app.refresh('enrollments');
    },
    pay: async (el, app) => { await paymentDialog(app, { student: app.by('students', el.dataset.id), invoice: el.dataset.inv ? app.by('invoices', el.dataset.inv) : null }); },
    invoice: async (el, app) => { await invoiceDialog(app, { student: app.by('students', el.dataset.id) }); },
    receipt: (el, app) => receiptDialog(app, app.s.payments.find(p => p.id === el.dataset.id)),
    async cancelInvoice(el, app) {
      const inv = app.by('invoices', el.dataset.id);
      if (inv.paid > 0) { toast('Cette facture a déjà des paiements : supprimez-les d\'abord.', 'err'); return; }
      if (!(await confirmBox(`Annuler la facture ${invNo(inv)} ?`, { ok: 'Annuler la facture' }))) return;
      await app.save('ctr_invoices', { cancelled: true }, inv.id); toast('Facture annulée.'); await app.refresh('invoices');
    },
    async deletePayment(el, app) {
      if (!app.isManager) { toast('Seul un responsable peut supprimer un paiement.', 'err'); return; }
      if (!(await confirmBox('Supprimer ce paiement ? Cette action est définitive.', { ok: 'Supprimer' }))) return;
      await app.del('ctr_payments', el.dataset.id); toast('Paiement supprimé.'); await app.refresh('payments');
    },
    async deleteStudent(el, app) {
      if (!(await confirmBox('Supprimer définitivement cet élève, ses inscriptions, factures et paiements ? Préférez « Inactif » pour garder l\'historique.', { ok: 'Supprimer' }))) return;
      await app.del('ctr_students', el.dataset.id); toast('Élève supprimé.'); await app.refresh(); app.go('#/students');
    },
    tab: (el, app) => app.go(`#/students/${el.dataset.id}?tab=${el.dataset.tab}`),
  },
  async after(app, r, root) {
    if (!r.id || (r.q.tab || 'enrollments') !== 'attendance') return;
    const box = root.querySelector('#att-box'); if (!box) return;
    try {
      const rows = await app.api.list('ctr_attendance', { eq: { org_id: app.org.id, student_id: r.id } });
      const ses = rows.length ? await app.api.list('ctr_sessions', { eq: { org_id: app.org.id }, in: { id: rows.map(x => x.session_id) } }) : [];
      const sm = new Map(ses.map(s => [s.id, s]));
      const list = rows.map(a => ({ a, s: sm.get(a.session_id) })).filter(x => x.s).sort((x, y) => y.s.date.localeCompare(x.s.date));
      const pres = list.filter(x => x.a.status === 'present' || x.a.status === 'late').length;
      const lbl = { present: ['paid', 'Présent'], absent: ['overdue', 'Absent'], late: ['partial', 'En retard'], excused: ['pending', 'Excusé'] };
      box.innerHTML = list.length ? `<div class="card-pad"><b>${Math.round(pres / list.length * 100)} %</b> de présence sur ${list.length} séance(s).</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Groupe</th><th>Statut</th></tr></thead><tbody>
        ${list.map(({ a, s }) => `<tr><td>${L.fmtDate(s.date)} · ${L.fmtTime(s.start_time)}</td><td>${esc(app.name('groups', s.group_id))}</td><td><span class="badge b-${lbl[a.status][0]}">${lbl[a.status][1]}</span></td></tr>`).join('')}
        </tbody></table></div>` : emptyState('Aucune présence enregistrée', 'Les présences apparaissent ici dès qu\'elles sont prises en séance.', '', 'check');
    } catch (e) { box.innerHTML = `<div class="card-pad muted">${esc(L.friendlyError(e))}</div>`; }
  },
};

function studentDetail(app, id, tab) {
  const s = app.by('students', id);
  if (!s) return emptyState('Élève introuvable', '', '<a class="btn" href="#/students">Retour</a>');
  const enr = app.s.enrollments.filter(e => e.student_id === id).sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1));
  const invs = (app.fin.byStudent.get(id) || []).slice().sort((a, b) => String(b.due_date).localeCompare(String(a.due_date)));
  const pays = app.s.payments.filter(p => p.student_id === id).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const due = invs.reduce((a, i) => a + i.remaining, 0);
  const phone = s.parent_phone || s.phone;
  const tabs = [['enrollments', `Inscriptions (${enr.filter(e => e.status === 'active').length})`], ['invoices', `Factures (${invs.length})`], ['payments', `Paiements (${pays.length})`], ['attendance', 'Présences'], ['info', 'Fiche']];
  let body = '';
  if (tab === 'enrollments') {
    body = enr.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Groupe</th><th class="hide-sm">Enseignant</th><th>Période</th><th class="r">Mensualité</th><th></th></tr></thead><tbody>
      ${enr.map(e => { const g = app.by('groups', e.group_id) || {}; return `<tr><td>${groupChip(app, g)} ${e.status === 'ended' ? '<span class="badge b-cancelled">Terminée</span>' : ''}</td>
        <td class="hide-sm">${esc(app.name('teachers', g.teacher_id))}</td><td class="nowrap">${L.fmtDate(e.start_date)} → ${e.end_date ? L.fmtDate(e.end_date) : '…'}</td>
        <td class="r num">${app.money(e.monthly_price)}</td>
        <td class="r nowrap"><button class="btn sm ghost" data-act="editEnroll" data-id="${e.id}">${icon('edit')}</button>${e.status === 'active' ? `<button class="btn sm ghost" data-act="endEnroll" data-id="${e.id}">Terminer</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : emptyState('Aucune inscription', '', `<button class="btn primary" data-act="enroll" data-id="${id}">${icon('plus')}Inscrire à un groupe</button>`, 'layers');
  } else if (tab === 'invoices') {
    body = invs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>N°</th><th>Description</th><th class="hide-sm">Échéance</th><th>Statut</th><th class="r">Montant</th><th class="r">Reste</th><th></th></tr></thead><tbody>
      ${invs.map(i => `<tr><td class="nowrap">${invNo(i)}</td><td>${esc(i.description || '')}</td><td class="hide-sm">${L.fmtDate(i.due_date)}</td><td>${invBadge(i.status)}</td>
        <td class="r num">${app.money(i.amount)}</td><td class="r num">${i.remaining ? app.money(i.remaining) : '—'}</td>
        <td class="r nowrap">${i.remaining > 0 ? `<button class="btn sm" data-act="pay" data-id="${id}" data-inv="${i.id}">Encaisser</button>` : ''}${i.status !== 'cancelled' && !i.paid ? `<button class="btn sm ghost" data-act="cancelInvoice" data-id="${i.id}" title="Annuler">${icon('x')}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState('Aucune facture', 'Les mensualités sont créées automatiquement chaque mois pour les inscriptions actives.', `<button class="btn" data-act="invoice" data-id="${id}">${icon('plus')}Facture ponctuelle</button>`, 'receipt');
  } else if (tab === 'payments') {
    body = pays.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Facture</th><th>Mode</th><th class="r">Montant</th><th></th></tr></thead><tbody>
      ${pays.map(p => { const i = app.by('invoices', p.invoice_id); return `<tr><td>${L.fmtDate(p.paid_at)}</td><td>${i ? invNo(i) + ' · ' + esc(i.description || '') : '—'}</td><td>${METHOD[p.method] || p.method}</td>
        <td class="r num"><b>${app.money(p.amount)}</b></td><td class="r nowrap"><button class="btn sm ghost" data-act="receipt" data-id="${p.id}">${icon('print')}Reçu</button>${app.isManager ? `<button class="btn sm ghost danger" data-act="deletePayment" data-id="${p.id}">${icon('trash')}</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : emptyState('Aucun paiement', '', '', 'wallet');
  } else if (tab === 'attendance') {
    body = '<div id="att-box"><div class="card-pad muted">Chargement…</div></div>';
  } else {
    const row = (k, v) => `<div class="list-item"><div class="grow muted">${k}</div><div>${v || '—'}</div></div>`;
    body = `<div class="list">${row('Téléphone élève', esc(s.phone))}${row('Parent', esc(s.parent_name))}${row('Téléphone parent', esc(s.parent_phone))}
      ${row('Niveau', esc(app.name('levels', s.level_id, '')))}${row('Établissement', esc(s.school))}${row('Site', esc(app.name('centers', s.center_id, '')))}
      ${row('Inscrit le', L.fmtDate(String(s.created_at).slice(0, 10)))}${row('Notes', esc(s.notes))}</div>
      <div class="card-pad" style="border-top:1px solid var(--border)"><button class="btn danger sm" data-act="deleteStudent" data-id="${id}">${icon('trash')}Supprimer l'élève</button></div>`;
  }
  return `<div class="small" style="margin-bottom:8px"><a href="#/students">← Élèves</a></div>
    ${pageHead(s.full_name, `${statusBadge(app.studentStatus.get(id))} ${s.status === 'inactive' ? '<span class="badge b-cancelled">Inactif</span>' : ''} ${due ? `· Reste dû : <b>${app.money(due)}</b>` : ''}`,
      `${phone ? `<a class="btn wa" href="${L.waLink(phone, `Bonjour ${s.parent_name || s.full_name}, `)}" target="_blank" rel="noopener">${icon('wa')}WhatsApp</a>` : ''}
       <button class="btn" data-act="edit" data-id="${id}">${icon('edit')}Modifier</button>
       <button class="btn" data-act="enroll" data-id="${id}">${icon('layers')}Inscrire</button>
       <button class="btn" data-act="invoice" data-id="${id}">${icon('receipt')}Facture</button>
       ${due > 0 ? `<button class="btn primary" data-act="pay" data-id="${id}">${icon('wallet')}Encaisser</button>` : ''}`)}
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/students/${id}?tab=${k}" class="${k === tab ? 'on' : ''}">${esc(l)}</a>`).join('')}</div>
    <div class="card">${body}</div>`;
}

// ---------------------------------------------------------------- Groups
function slotSummary(app, gid) {
  return app.s.slots.filter(s => s.group_id === gid).sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
    .map(s => `${L.DAYS_SHORT[s.weekday]} ${L.fmtTime(s.start_time)}–${L.fmtTime(s.end_time)}`).join(' · ');
}

const COLORS = ['#1b3a8c', '#d7262e', '#0e7490', '#9333ea', '#db2777', '#0891b2', '#65a30d', '#b42323', '#475569'];

export async function groupDialog(app, g = null, preset = {}) {
  const isNew = !g; g = g || { ...preset, active: true, start_date: today(), center_id: app.centerId || app.s.centers[0]?.id, color: COLORS[app.s.groups.length % COLORS.length], capacity: 12 };
  const slots = isNew ? [] : app.s.slots.filter(s => s.group_id === g.id);
  const dayOpts = L.DAYS.slice(1).map((d, i) => ({ value: i + 1, label: d }));
  const slotRow = (s = {}) => `<div class="slot-row" style="display:grid;grid-template-columns:1.3fr 1fr 1fr auto;gap:8px;margin-bottom:8px">
      ${select('weekday', dayOpts, s.weekday || 1)}${input('start_time', L.fmtTime(s.start_time) || '18:00', { type: 'time' })}${input('end_time', L.fmtTime(s.end_time) || '19:30', { type: 'time' })}
      <button type="button" class="btn ghost icon" data-del-slot aria-label="Retirer">${icon('x')}</button></div>`;
  return modal({
    title: isNew ? 'Nouveau groupe' : 'Modifier le groupe', wide: true,
    body: `<div class="form-grid">
      ${field('Nom du groupe', input('name', g.name, { required: true, placeholder: 'Ex. Maths — 2ème Bac (G1)' }), 'full')}
      ${field('Niveau', select('level_id', opts(app.s.levels), g.level_id, { empty: '—' }))}
      ${field('Matière', select('subject_id', opts(app.s.subjects), g.subject_id, { empty: '—' }))}
      ${field('Enseignant', select('teacher_id', opts(app.s.teachers.filter(t => t.active || t.id === g.teacher_id), 'full_name'), g.teacher_id, { empty: '—' }))}
      ${field('Salle', select('room_id', opts(app.s.rooms), g.room_id, { empty: '—' }))}
      ${field('Prix mensuel (' + app.cur + ')', input('monthly_price', g.monthly_price, { type: 'number', step: '0.01', min: 0, placeholder: 'Vide = grille de prix' }))}
      ${field('Capacité', input('capacity', g.capacity, { type: 'number', min: 1 }))}
      ${field('Début', input('start_date', g.start_date, { type: 'date', required: true }))}
      ${field('Fin (optionnel)', input('end_date', g.end_date, { type: 'date' }))}
      ${app.s.centers.length > 1 ? field('Site', select('center_id', opts(app.s.centers), g.center_id)) : `<input type="hidden" name="center_id" value="${esc(g.center_id || '')}">`}
      ${field('Couleur', `<div style="display:flex;gap:6px;flex-wrap:wrap">${COLORS.map(c => `<label style="cursor:pointer"><input type="radio" name="color" value="${c}"${c === g.color ? ' checked' : ''} style="display:none"><span data-sw style="display:inline-block;width:24px;height:24px;border-radius:6px;background:${c};border:2px solid ${c === g.color ? 'var(--ink)' : 'transparent'}"></span></label>`).join('')}</div>`)}
      ${!isNew ? `<label class="check"><input type="checkbox" name="active"${g.active ? ' checked' : ''}> Groupe actif</label>` : ''}
      <div class="full" style="border-top:1px solid var(--border);padding-top:12px"><h3>Emploi du temps</h3><p class="small muted">Fait une fois : les séances sont créées automatiquement chaque semaine.</p>
        <div id="slots">${slots.map(slotRow).join('')}</div>
        <button type="button" class="btn sm" id="add-slot">${icon('plus')}Ajouter un créneau</button></div>
    </div>`,
    onOpen(ov) {
      const box = ov.querySelector('#slots');
      ov.querySelector('#add-slot').addEventListener('click', () => box.insertAdjacentHTML('beforeend', slotRow()));
      box.addEventListener('click', e => { if (e.target.closest('[data-del-slot]')) e.target.closest('.slot-row').remove(); });
      ov.querySelectorAll('input[name=color]').forEach(r => r.addEventListener('change', () => ov.querySelectorAll('[data-sw]').forEach(sw => { sw.style.borderColor = sw.previousElementSibling.checked ? 'var(--ink)' : 'transparent'; })));
      const lvl = ov.querySelector('[name=level_id]'), sub = ov.querySelector('[name=subject_id]'), name = ov.querySelector('[name=name]');
      const auto = () => { if (name.dataset.touched) return; const a = app.name('subjects', sub.value, ''), b = app.name('levels', lvl.value, ''); if (a || b) name.value = [a, b].filter(Boolean).join(' — '); };
      name.addEventListener('input', () => { name.dataset.touched = '1'; }); if (!isNew) name.dataset.touched = '1';
      lvl.addEventListener('change', auto); sub.addEventListener('change', auto);
    },
    onSubmit: async (d, form) => {
      const newSlots = [...form.querySelectorAll('.slot-row')].map(r => ({ weekday: Number(r.querySelector('[name=weekday]').value), start_time: r.querySelector('[name=start_time]').value, end_time: r.querySelector('[name=end_time]').value }));
      if (newSlots.some(s => !s.start_time || !s.end_time || s.end_time <= s.start_time)) throw new Error('Chaque créneau doit finir après son début.');
      const row = { name: d.name, level_id: nullIfEmpty(d.level_id), subject_id: nullIfEmpty(d.subject_id), teacher_id: nullIfEmpty(d.teacher_id),
        room_id: nullIfEmpty(d.room_id), monthly_price: num(d.monthly_price), capacity: num(d.capacity), start_date: d.start_date,
        end_date: nullIfEmpty(d.end_date), center_id: nullIfEmpty(d.center_id), color: d.color || g.color };
      if (!isNew) row.active = !!d.active;
      const saved = await app.save('ctr_groups', row, isNew ? null : g.id);
      const old = slots.map(s => `${s.weekday}|${L.fmtTime(s.start_time)}|${L.fmtTime(s.end_time)}`).sort().join();
      const nw = newSlots.map(s => `${s.weekday}|${s.start_time}|${s.end_time}`).sort().join();
      const teacherChanged = !isNew && (g.teacher_id || null) !== row.teacher_id;
      if (old !== nw || teacherChanged) {
        await app.run(async () => {
          for (const s of slots) await app.api.remove('ctr_group_slots', { id: s.id });
          if (newSlots.length) await app.api.insert('ctr_group_slots', newSlots.map(s => ({ ...s, org_id: app.org.id, group_id: saved.id, room_id: row.room_id })));
          // future sessions without attendance follow the new timetable
          const future = await app.api.list('ctr_sessions', { eq: { org_id: app.org.id, group_id: saved.id, status: 'scheduled' }, gte: { date: today() } });
          for (const s of future) await app.api.remove('ctr_sessions', { id: s.id });
        });
      }
      toast(isNew ? 'Groupe créé.' : 'Groupe mis à jour.');
      await app.load(['ctr_groups', 'ctr_group_slots']);
      await app.loadSessions(app.sessionsRange.from, app.sessionsRange.to, true);
      app.render();
      return saved;
    },
  });
}

export const groups = {
  title: 'Groupes',
  render(app, r) {
    if (r.id) return groupDetail(app, r.id);
    const st = app.viewState;
    const count = new Map();
    for (const e of app.s.enrollments) if (e.status === 'active') count.set(e.group_id, (count.get(e.group_id) || 0) + 1);
    const list = app.s.groups.filter(g => app.inCenter(g) && (st.showAll || g.active) && L.matches(st.q, g.name, app.name('teachers', g.teacher_id, ''), app.name('subjects', g.subject_id, '')))
      .sort((a, b) => a.name.localeCompare(b.name));
    return `${pageHead(app.isTeacher ? 'Mes groupes' : 'Groupes', `${app.s.groups.filter(g => g.active).length} groupe(s) actif(s)`, app.isStaff ? `<button class="btn primary" data-act="newGroup">${icon('plus')}Nouveau groupe</button>` : '')}
      <div class="card"><div class="toolbar"><div class="search">${icon('search')}<input data-input="q" placeholder="Rechercher un groupe, un enseignant…" value="${esc(st.q || '')}"></div>
        <label class="check"><input type="checkbox" data-change="showAll"${st.showAll ? ' checked' : ''}> Afficher les groupes archivés</label></div>
      ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Groupe</th><th class="hide-sm">Enseignant</th><th class="hide-sm">Horaires</th><th>Élèves</th>${app.isStaff ? '<th class="r">Mensualité</th>' : ''}</tr></thead><tbody>
        ${list.map(g => { const n = count.get(g.id) || 0; const pct = g.capacity ? Math.min(100, Math.round(n / g.capacity * 100)) : 0; return `<tr class="click" data-act="open" data-id="${g.id}">
          <td>${groupChip(app, g)}${g.active ? '' : ' <span class="badge b-cancelled">Archivé</span>'}<div class="cell-sub">${esc([app.name('levels', g.level_id, ''), app.name('subjects', g.subject_id, ''), app.name('rooms', g.room_id, '')].filter(Boolean).join(' · '))}</div></td>
          <td class="hide-sm">${esc(app.name('teachers', g.teacher_id))}</td>
          <td class="hide-sm small">${esc(slotSummary(app, g.id) || '—')}</td>
          <td style="min-width:110px"><div class="num"><b>${n}</b>${g.capacity ? ' / ' + g.capacity : ''}</div>${g.capacity ? `<div class="progress"><span style="width:${pct}%;${pct >= 100 ? 'background:var(--bad)' : ''}"></span></div>` : ''}</td>
          ${app.isStaff ? `<td class="r num">${app.money(groupPrice(app, g))}</td>` : ''}</tr>`; }).join('')}
      </tbody></table></div>` : emptyState('Aucun groupe', app.isStaff ? 'Créez un groupe avec son niveau, sa matière, son enseignant et ses horaires.' : 'Aucun groupe ne vous est encore attribué.', app.isStaff ? `<button class="btn primary" data-act="newGroup">${icon('plus')}Nouveau groupe</button>` : '', 'layers')}</div>`;
  },
  inputs: { q(el, app) { app.viewState.q = el.value; app.rerender(); } },
  changes: { showAll(el, app) { app.viewState.showAll = el.checked; app.render(); } },
  actions: {
    open: (el, app) => app.go('#/groups/' + el.dataset.id),
    newGroup: async (el, app) => { const g = await groupDialog(app); if (g?.id) app.go('#/groups/' + g.id); },
    edit: async (el, app) => { await groupDialog(app, app.by('groups', el.dataset.id)); },
    enroll: async (el, app) => { await enrollDialog(app, { group: app.by('groups', el.dataset.id) }); },
    addStudent: async (el, app) => { const s = await studentDialog(app); if (s?.id) await enrollDialog(app, { student: s, group: app.by('groups', el.dataset.id) }); },
    student: (el, app) => app.isStaff && app.go('#/students/' + el.dataset.id),
    attendance: (el, app) => import('./schedule.js').then(m => m.attendanceDialog(app, el.dataset.id)),
    async deleteGroup(el, app) {
      const n = app.s.enrollments.filter(e => e.group_id === el.dataset.id).length;
      if (!(await confirmBox(n ? `Ce groupe a ${n} inscription(s). Le supprimer retire aussi ces inscriptions et ses séances (les factures restent). Préférez l'archiver.` : 'Supprimer ce groupe ?', { ok: 'Supprimer' }))) return;
      await app.del('ctr_groups', el.dataset.id); toast('Groupe supprimé.'); await app.refresh(); app.go('#/groups');
    },
  },
};

function groupDetail(app, id) {
  const g = app.by('groups', id);
  if (!g) return emptyState('Groupe introuvable', '', '<a class="btn" href="#/groups">Retour</a>');
  const enr = app.s.enrollments.filter(e => e.group_id === id && e.status === 'active');
  const roster = enr.map(e => ({ e, s: app.by('students', e.student_id) })).filter(x => x.s).sort((a, b) => a.s.full_name.localeCompare(b.s.full_name));
  const t = today();
  const recent = app.s.sessions.filter(s => s.group_id === id && s.date <= t).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const next = app.s.sessions.filter(s => s.group_id === id && s.date >= t && s.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).slice(0, 4);
  const sessRow = s => `<div class="list-item"><div class="grow"><div class="cell-main">${L.DAYS[L.isoWeekday(s.date)]} ${L.fmtDate(s.date, false)}</div><div class="cell-sub">${L.fmtTime(s.start_time)}–${L.fmtTime(s.end_time)}</div></div>
    ${s.status === 'done' ? '<span class="badge b-paid">Fait</span>' : s.status === 'cancelled' ? '<span class="badge b-cancelled">Annulée</span>' : ''}<button class="btn sm" data-act="attendance" data-id="${s.id}">Présences</button></div>`;
  return `<div class="small" style="margin-bottom:8px"><a href="#/groups">← Groupes</a></div>
    ${pageHead(g.name, esc([app.name('levels', g.level_id, ''), app.name('subjects', g.subject_id, ''), app.name('teachers', g.teacher_id, ''), app.name('rooms', g.room_id, '')].filter(Boolean).join(' · ')),
      app.isStaff ? `<button class="btn" data-act="edit" data-id="${id}">${icon('edit')}Modifier</button><button class="btn" data-act="addStudent" data-id="${id}">${icon('plus')}Nouvel élève</button><button class="btn primary" data-act="enroll" data-id="${id}">${icon('users')}Inscrire un élève</button>` : '')}
    <div class="kpis k4">${kpi('Élèves', `${roster.length}${g.capacity ? `<small>/ ${g.capacity}</small>` : ''}`)}${kpi('Horaires', `<span style="font-size:13px">${esc(slotSummary(app, id) || 'À définir')}</span>`)}
      ${app.isStaff ? kpi('Mensualité', `${L.money(groupPrice(app, g), '').trim()}<small>${esc(app.cur)}</small>`) : kpi('Début', L.fmtDate(g.start_date))}
      ${app.isStaff ? kpi('Impayés du groupe', String(roster.filter(x => ['overdue', 'partial'].includes(app.studentStatus.get(x.s.id))).length), 'bad') : kpi('Fin', g.end_date ? L.fmtDate(g.end_date) : '—')}</div>
    <div class="grid grid-2" style="grid-template-columns:1.4fr 1fr">
      <div class="card"><div class="card-head"><h2>Élèves inscrits</h2></div>
        ${roster.length ? `<div class="table-wrap"><table class="t"><tbody>${roster.map(({ s, e }) => `<tr class="${app.isStaff ? 'click' : ''}" data-act="student" data-id="${s.id}"><td><div class="cell-main">${esc(s.full_name)}</div><div class="cell-sub">${esc(s.parent_phone || s.phone || '')}</div></td>
          <td class="small muted hide-sm">depuis ${L.fmtDate(e.start_date)}</td>${app.isStaff ? `<td class="r">${statusBadge(app.studentStatus.get(s.id))}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
          : emptyState('Aucun élève inscrit', '', app.isStaff ? `<button class="btn primary" data-act="enroll" data-id="${id}">${icon('plus')}Inscrire un élève</button>` : '', 'users')}</div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-head"><h2>Prochaines séances</h2></div><div class="list">${next.map(sessRow).join('') || emptyState('Aucune séance prévue', app.isStaff ? 'Ajoutez des créneaux dans « Modifier ».' : '', '', 'calendar')}</div></div>
        <div class="card"><div class="card-head"><h2>Séances passées</h2></div><div class="list">${recent.map(sessRow).join('') || '<div class="card-pad muted small">Aucune pour l\'instant.</div>'}</div></div>
        ${app.isStaff ? `<div><button class="btn sm danger" data-act="deleteGroup" data-id="${id}">${icon('trash')}Supprimer le groupe</button></div>` : ''}
      </div></div>`;
}

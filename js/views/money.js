// Payments & invoices, WhatsApp reminders, expenses.
import { esc, icon, modal, field, input, select, opts, nullIfEmpty, num, toast, emptyState, confirmBox } from '../ui.js';
import * as L from '../logic.js';
import { pageHead, moneyKpis, kpi, pickStudent } from './core.js';
import { invBadge, invNo, paymentDialog, invoiceDialog, receiptDialog, METHOD, exportCsv } from './common.js';

function monthNav(app) {
  const m = app.viewState.month;
  return `<div class="seg"><button data-act="prevMonth" aria-label="Mois précédent">${icon('chevL')}</button><button data-act="thisMonth" style="min-width:130px">${esc(L.monthLabel(m))}</button><button data-act="nextMonth" aria-label="Mois suivant">${icon('chevR')}</button></div>`;
}
const monthActions = {
  prevMonth(el, app) { app.viewState.month = L.addMonths(app.viewState.month, -1); app.render(); },
  nextMonth(el, app) { app.viewState.month = L.addMonths(app.viewState.month, 1); app.render(); },
  thisMonth(el, app) { app.viewState.month = L.monthStart(L.today()); app.render(); },
};

// ---------------------------------------------------------------- Payments
export const payments = {
  title: 'Paiements',
  allow: app => app.isStaff,
  render(app, r) {
    const st = app.viewState;
    st.month ||= L.monthStart(L.today());
    const tab = r.q.tab || 'invoices';
    const ms = st.month, me = L.monthEnd(ms);
    const inStudentCenter = sid => app.inCenter(app.by('students', sid) || {});
    let body;
    if (tab === 'invoices') {
      const list = app.fin.invoices.filter(i => {
        if (!inStudentCenter(i.student_id)) return false;
        if (st.status === 'open') { if (!(i.remaining > 0 && i.status !== 'cancelled')) return false; }
        else {
          const d = String(i.period_month || i.due_date).slice(0, 10);
          if (d < ms || d > me) return false;
          if (st.status && i.status !== st.status) return false;
        }
        return L.matches(st.q, app.name('students', i.student_id), i.description, invNo(i));
      }).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)) || (a.number - b.number));
      const toGen = L.plannedInvoices(app.s.enrollments, app.s.groups, app.s.invoices, ms).length;
      body = `<div class="card"><div class="toolbar">
          <div class="search">${icon('search')}<input data-input="q" placeholder="Élève, description, n° de facture…" value="${esc(st.q || '')}"></div>
          ${select('status', [{ value: 'open', label: 'Tous les impayés (tous mois)' }, { value: 'overdue', label: 'En retard' }, { value: 'partial', label: 'Partielles' }, { value: 'pending', label: 'En attente' }, { value: 'paid', label: 'Payées' }, { value: 'cancelled', label: 'Annulées' }], st.status || '', { empty: 'Toutes les factures du mois' }).replace('<select', '<select data-change="filter"')}
          ${toGen && app.active ? `<button class="btn" data-act="generate">${icon('refresh')}Générer ${toGen} mensualité(s)</button>` : ''}
        </div>
        ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>N°</th><th>Élève</th><th class="hide-sm">Description</th><th class="hide-sm">Échéance</th><th>Statut</th><th class="r">Montant</th><th class="r">Reste</th><th></th></tr></thead><tbody>
          ${list.map(i => `<tr><td class="nowrap small">${invNo(i)}</td><td><a href="#/students/${i.student_id}" class="cell-main">${esc(app.name('students', i.student_id))}</a></td>
            <td class="hide-sm">${esc(i.description || '')}</td><td class="hide-sm nowrap">${L.fmtDate(i.due_date)}</td><td>${invBadge(i.status)}</td>
            <td class="r num">${app.money(i.amount)}</td><td class="r num">${i.remaining ? `<b>${app.money(i.remaining)}</b>` : '—'}</td>
            <td class="r">${i.remaining > 0 && app.active ? `<button class="btn sm" data-act="pay" data-id="${i.id}">Encaisser</button>` : ''}</td></tr>`).join('')}
          </tbody></table></div>` : emptyState('Aucune facture', st.status === 'open' ? 'Aucun impayé : tout est réglé.' : 'Aucune facture pour ce mois avec ces filtres.', '', 'receipt')}</div>`;
    } else {
      const list = app.s.payments.filter(p => p.paid_at >= ms && p.paid_at <= me && inStudentCenter(p.student_id) && L.matches(st.q, app.name('students', p.student_id), p.reference))
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || String(b.created_at).localeCompare(String(a.created_at)));
      const by = Object.keys(METHOD).map(m => [m, list.filter(p => p.method === m).reduce((s, p) => s + Number(p.amount), 0)]).filter(([, v]) => v);
      body = `<div class="kpis k4">${by.map(([m, v]) => kpi(METHOD[m], `${L.money(v, '').trim()}<small>${esc(app.cur)}</small>`)).join('') || ''}</div>
        <div class="card"><div class="toolbar"><div class="search">${icon('search')}<input data-input="q" placeholder="Élève, référence…" value="${esc(st.q || '')}"></div>
          <button class="btn" data-act="exportPayments">${icon('download')}Exporter</button></div>
        ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Élève</th><th class="hide-sm">Facture</th><th>Mode</th><th class="hide-sm">Reçu par</th><th class="r">Montant</th><th></th></tr></thead><tbody>
          ${list.map(p => { const i = app.by('invoices', p.invoice_id); return `<tr><td class="nowrap">${L.fmtDate(p.paid_at)}</td><td><a href="#/students/${p.student_id}" class="cell-main">${esc(app.name('students', p.student_id))}</a></td>
            <td class="hide-sm small">${i ? invNo(i) + ' · ' + esc(i.description || '') : '—'}</td><td>${METHOD[p.method] || p.method}${p.reference ? `<div class="cell-sub">${esc(p.reference)}</div>` : ''}</td>
            <td class="hide-sm small">${esc(p.received_by_name || '')}</td><td class="r num"><b>${app.money(p.amount)}</b></td>
            <td class="r"><button class="btn sm ghost" data-act="receipt" data-id="${p.id}">${icon('print')}</button></td></tr>`; }).join('')}
          </tbody></table></div>` : emptyState('Aucun paiement ce mois-ci', '', '', 'wallet')}</div>`;
    }
    return `${pageHead('Paiements', 'Ce qui est facturé, encaissé, en attente ou en retard.', `${monthNav(app)}
        <button class="btn" data-act="newInvoice">${icon('receipt')}Facture ponctuelle</button><button class="btn primary" data-act="newPayment">${icon('wallet')}Encaisser</button>`)}
      ${moneyKpis(app, ms, me)}
      <div class="tabs"><a href="#/payments?tab=invoices" class="${tab === 'invoices' ? 'on' : ''}">Factures</a><a href="#/payments?tab=received" class="${tab === 'received' ? 'on' : ''}">Paiements reçus</a></div>
      ${body}`;
  },
  inputs: { q(el, app) { app.viewState.q = el.value; app.rerender(); } },
  changes: { filter(el, app) { app.viewState.status = el.value; app.render(); } },
  actions: {
    ...monthActions,
    async generate(el, app) {
      const rows = L.plannedInvoices(app.s.enrollments, app.s.groups, app.s.invoices, app.viewState.month);
      if (!rows.length) return;
      if (!(await confirmBox(`Créer ${rows.length} mensualité(s) pour ${L.monthLabel(app.viewState.month)} ?`, { ok: 'Générer', danger: false }))) return;
      await app.run(() => app.api.insert('ctr_invoices', rows, { onConflict: 'enrollment_id,period_month', ignoreDuplicates: true }), `${rows.length} facture(s) créée(s).`);
      await app.refresh('invoices');
    },
    async pay(el, app) { const i = app.by('invoices', el.dataset.id); await paymentDialog(app, { student: app.by('students', i.student_id), invoice: i }); },
    newInvoice: (el, app) => invoiceDialog(app),
    async newPayment(el, app) {
      const st = await pickStudent(app, 'Encaisser — choisir l\'élève', s => app.fin.byStudent.get(s.id)?.some(i => i.remaining > 0));
      if (st) await paymentDialog(app, { student: st });
    },
    receipt: (el, app) => receiptDialog(app, app.s.payments.find(p => p.id === el.dataset.id)),
    exportPayments(el, app) {
      const ms = app.viewState.month, me = L.monthEnd(ms);
      exportCsv(`paiements-${ms.slice(0, 7)}.csv`, ['Date', 'Élève', 'Facture', 'Description', 'Mode', 'Référence', 'Reçu par', 'Montant'],
        app.s.payments.filter(p => p.paid_at >= ms && p.paid_at <= me).map(p => { const i = app.by('invoices', p.invoice_id) || {};
          return [p.paid_at, app.name('students', p.student_id), i.number ? invNo(i) : '', i.description || '', METHOD[p.method], p.reference, p.received_by_name, p.amount]; }));
    },
  },
};

// ---------------------------------------------------------------- Reminders
export async function logReminder(app, key, el) {
  const r = app.reminders.find(x => x.key === key);
  if (el?.href) window.open(el.href, '_blank', 'noopener');
  if (!r || r.sent) return;
  await app.run(() => app.api.insert('ctr_reminder_log', { org_id: app.org.id, student_id: r.student.id, invoice_id: r.invoice?.id || null,
    enrollment_id: r.kind === 'renewal' ? r.enrollment.id : null, kind: r.kind, sent_at: new Date().toISOString() }));
  await app.refresh('reminderLog');
}

export const reminders = {
  title: 'Relances',
  allow: app => app.isStaff,
  render(app, r) {
    const st = app.viewState;
    const tab = r.q.tab || 'unpaid';
    const all = app.reminders.filter(x => app.inCenter(x.student));
    const count = k => all.filter(x => x.kind === k && !x.sent).length;
    const list = all.filter(x => x.kind === tab && (st.showSent || !x.sent));
    const info = x => x.kind === 'unpaid' ? `${x.days} jour(s) de retard · reste ${app.money(x.invoice.remaining)}`
      : x.kind === 'soon' ? (x.days >= 0 ? `à régler sous ${x.days} jour(s) · ${app.money(x.invoice.remaining)}` : 'échéance dépassée')
      : (x.days >= 0 ? `se termine dans ${x.days} jour(s)` : `terminée depuis ${-x.days} jour(s)`);
    const tabs = [['unpaid', 'Impayés'], ['soon', 'Bientôt dus'], ['renewal', 'Fin d\'inscription']];
    return `${pageHead('Relances WhatsApp', 'Chaque jour : qui n\'a pas payé ou doit renouveler, avec le message déjà écrit.',
      app.isManager ? `<a class="btn" href="#/settings?tab=messages">${icon('edit')}Modifier les messages</a>` : '')}
      <div class="tabs">${tabs.map(([k, l]) => `<a href="#/reminders?tab=${k}" class="${tab === k ? 'on' : ''}">${l}${count(k) ? ` <span class="badge b-overdue plain">${count(k)}</span>` : ''}</a>`).join('')}</div>
      <div class="card"><div class="toolbar"><label class="check"><input type="checkbox" data-change="showSent"${st.showSent ? ' checked' : ''}> Afficher aussi les relances déjà envoyées aujourd'hui</label></div>
      ${list.length ? `<div class="list">${list.map(x => `<div class="list-item" style="align-items:flex-start">
        <div class="grow"><div class="cell-main"><a href="#/students/${x.student.id}">${esc(x.student.full_name)}</a> ${x.group ? `<span class="chip">${esc(x.group.name)}</span>` : ''} ${x.sent ? '<span class="badge b-paid">Envoyé</span>' : ''}</div>
          <div class="cell-sub">${esc(info(x))}${x.phone ? ' · ' + esc(x.phone) : ' · <b style="color:var(--bad)">pas de numéro</b>'}</div>
          <div class="small" style="margin-top:6px;padding:8px 10px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">${esc(x.text)}</div></div>
        <div class="actions" style="flex-direction:column;align-items:stretch">
          ${x.phone ? `<a class="btn wa sm" href="${L.waLink(x.phone, x.text)}" target="_blank" rel="noopener" data-act="send" data-key="${esc(x.key)}">${icon('wa')}Envoyer</a>` : ''}
          ${!x.sent ? `<button class="btn sm" data-act="mark" data-key="${esc(x.key)}">${icon('check')}Marquer envoyé</button>` : ''}
          ${x.invoice && x.invoice.remaining > 0 ? `<button class="btn sm" data-act="pay" data-id="${x.invoice.id}">Encaisser</button>` : ''}</div></div>`).join('')}</div>`
        : emptyState('Rien à relancer ici', tab === 'unpaid' ? 'Aucun paiement en retard.' : tab === 'soon' ? 'Aucune échéance dans les 3 prochains jours.' : 'Aucune inscription ne se termine cette semaine.', '', 'check')}</div>`;
  },
  changes: { showSent(el, app) { app.viewState.showSent = el.checked; app.render(); } },
  actions: {
    send: (el, app) => logReminder(app, el.dataset.key, el),
    mark: (el, app) => logReminder(app, el.dataset.key),
    async pay(el, app) { const i = app.by('invoices', el.dataset.id); await paymentDialog(app, { student: app.by('students', i.student_id), invoice: i }); },
  },
};

// ---------------------------------------------------------------- Expenses
const CATS = ['Loyer', 'Salaires', 'Électricité / Eau', 'Internet / Téléphone', 'Fournitures', 'Marketing', 'Entretien', 'Impôts / Taxes', 'Autre'];

async function expenseDialog(app, e = null) {
  const isNew = !e; e = e || { spent_at: L.today(), category: 'Autre', center_id: app.centerId || app.s.centers[0]?.id };
  return modal({
    title: isNew ? 'Nouvelle dépense' : 'Modifier la dépense',
    body: `<div class="form-grid">
      ${field('Catégorie', `<input name="category" list="exp-cats" value="${esc(e.category)}" required><datalist id="exp-cats">${CATS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      ${field('Montant (' + app.cur + ')', input('amount', e.amount, { type: 'number', step: '0.01', min: 0, required: true }))}
      ${field('Date', input('spent_at', e.spent_at, { type: 'date', required: true }))}
      ${app.s.centers.length > 1 ? field('Site', select('center_id', opts(app.s.centers), e.center_id)) : `<input type="hidden" name="center_id" value="${esc(e.center_id || '')}">`}
      ${field('Description', input('description', e.description), 'full')}</div>`,
    onSubmit: async d => {
      await app.save('ctr_expenses', { category: d.category, amount: num(d.amount), spent_at: d.spent_at, description: nullIfEmpty(d.description), center_id: nullIfEmpty(d.center_id) }, isNew ? null : e.id);
      toast('Dépense enregistrée.'); await app.refresh('expenses');
    },
  });
}

export const expenses = {
  title: 'Dépenses',
  allow: app => app.isStaff,
  render(app) {
    const st = app.viewState; st.month ||= L.monthStart(L.today());
    const ms = st.month, me = L.monthEnd(ms);
    const list = app.s.expenses.filter(e => e.spent_at >= ms && e.spent_at <= me && app.inCenter(e)).sort((a, b) => b.spent_at.localeCompare(a.spent_at));
    const payouts = app.s.payouts.filter(p => p.status === 'paid' && p.paid_at >= ms && p.paid_at <= me);
    const byCat = new Map(); for (const e of list) byCat.set(e.category, (byCat.get(e.category) || 0) + Number(e.amount));
    const payTotal = payouts.reduce((s, p) => s + Number(p.amount), 0);
    const total = [...byCat.values()].reduce((a, b) => a + b, 0) + payTotal;
    return `${pageHead('Dépenses', 'Loyer, factures, fournitures… et la paie des enseignants versée.', `${monthNav(app)}<button class="btn primary" data-act="new">${icon('plus')}Nouvelle dépense</button>`)}
      <div class="grid grid-2" style="grid-template-columns:1fr 2fr">
        <div class="card"><div class="card-head"><h2>Total du mois</h2><b class="num">${app.money(total)}</b></div><div class="list">
          ${[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="list-item"><div class="grow">${esc(c)}<div class="progress" style="margin-top:4px"><span style="width:${Math.round(v / (total || 1) * 100)}%"></span></div></div><b class="num">${app.money(v)}</b></div>`).join('')}
          ${payTotal ? `<div class="list-item"><div class="grow">Paie des enseignants<div class="progress" style="margin-top:4px"><span style="width:${Math.round(payTotal / (total || 1) * 100)}%;background:var(--accent)"></span></div></div><b class="num">${app.money(payTotal)}</b></div>` : ''}
          ${!total ? '<div class="card-pad muted small">Aucune dépense ce mois-ci.</div>' : ''}</div></div>
        <div class="card">${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Catégorie</th><th class="hide-sm">Description</th><th class="r">Montant</th><th></th></tr></thead><tbody>
          ${list.map(e => `<tr><td class="nowrap">${L.fmtDate(e.spent_at)}</td><td>${esc(e.category)}</td><td class="hide-sm">${esc(e.description || '')}</td><td class="r num"><b>${app.money(e.amount)}</b></td>
            <td class="r nowrap"><button class="btn sm ghost" data-act="edit" data-id="${e.id}">${icon('edit')}</button><button class="btn sm ghost danger" data-act="del" data-id="${e.id}">${icon('trash')}</button></td></tr>`).join('')}
          </tbody></table></div>` : emptyState('Aucune dépense ce mois-ci', 'Notez le loyer, l\'électricité, les fournitures… pour connaître votre net.', `<button class="btn primary" data-act="new">${icon('plus')}Nouvelle dépense</button>`, 'receipt')}</div></div>`;
  },
  actions: {
    ...monthActions,
    new: (el, app) => expenseDialog(app),
    edit: (el, app) => expenseDialog(app, app.s.expenses.find(e => e.id === el.dataset.id)),
    async del(el, app) { if (!(await confirmBox('Supprimer cette dépense ?', { ok: 'Supprimer' }))) return; await app.del('ctr_expenses', el.dataset.id); toast('Dépense supprimée.'); await app.refresh('expenses'); },
  },
};

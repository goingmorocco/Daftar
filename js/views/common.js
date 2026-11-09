// Shared dialogs: student, enrollment, payment, invoice, receipt.
import { esc, icon, modal, field, input, select, textarea, opts, nullIfEmpty, num, toast, badge } from '../ui.js';
import * as L from '../logic.js';

export const METHOD = { cash: 'Espèces', cheque: 'Chèque', transfer: 'Virement', card: 'Carte' };
export const statusBadge = s => badge(s, s === 'none' ? 'Aucune facture' : s === 'paid' ? 'À jour' : L.STATUS_LABEL[s]);
export const invBadge = s => badge(s, L.STATUS_LABEL[s]);
export const invNo = inv => `F-${String(inv.number ?? '').padStart(4, '0')}`;

export function groupLabel(app, g) {
  return `${g.name}${g.teacher_id ? ' · ' + app.name('teachers', g.teacher_id) : ''}`;
}
export function groupPrice(app, g) {
  if (!g) return 0;
  if (g.monthly_price != null && g.monthly_price !== '') return Number(g.monthly_price);
  return L.priceFor(app.s.prices, g.level_id, g.subject_id) ?? 0;
}
export function groupChip(app, g) {
  return g ? `<span class="chip"><span class="sw" style="background:${esc(g.color || 'var(--primary)')}"></span>${esc(g.name)}</span>` : '';
}

/** Create the current-month invoice for a new enrollment when automatic invoicing is on. */
export async function invoiceNewEnrollment(app, enrollment) {
  if (!app.settings.auto_invoices) return;
  const rows = L.plannedCycles([enrollment], app.s.groups, []);
  if (rows.length) await app.api.insert('ctr_invoices', rows, { onConflict: 'enrollment_id,period_month', ignoreDuplicates: true });
}

export async function studentDialog(app, st = null, preset = {}) {
  const isNew = !st; st = st || { status: 'active', center_id: app.centerId || app.s.centers[0]?.id, ...preset };
  const pg = preset.group_id ? app.by('groups', preset.group_id) : null;
  const groups = app.s.groups.filter(g => g.active);
  const enrollBlock = isNew ? `
    <div class="full" style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px"><h3>Inscription</h3><p class="small muted">Optionnel — vous pourrez inscrire l'étudiant à d'autres groupes ensuite.</p></div>
    ${field('Groupe', select('group_id', opts(groups, g => groupLabel(app, g)), pg?.id || '', { empty: '— Aucun pour l\'instant —' }))}
    ${field('Prix mensuel (' + app.cur + ')', input('monthly_price', pg ? groupPrice(app, pg) : '', { type: 'number', step: '0.01', min: 0, placeholder: 'Rempli selon le niveau et la matière' }))}
    ${field('Début', input('start_date', L.today(), { type: 'date' }))}
    ${field('Fin (optionnel)', input('end_date', '', { type: 'date' }))}` : '';
  return modal({
    title: isNew ? 'Nouvel étudiant' : 'Modifier l\'étudiant', wide: true,
    body: `<div class="form-grid">
      ${field('Nom complet', input('full_name', st.full_name, { required: true }), 'full')}
      ${field('Téléphone étudiant', input('phone', st.phone, { type: 'tel', placeholder: '06…' }))}
      ${field('Niveau', select('level_id', opts(app.s.levels), st.level_id, { empty: '—' }))}
      ${field('Nom du parent', input('parent_name', st.parent_name))}
      ${field('Téléphone parent (WhatsApp)', input('parent_phone', st.parent_phone, { type: 'tel', placeholder: '06…' }))}
      ${field('Établissement scolaire', input('school', st.school))}
      ${app.s.centers.length > 1 ? field('Site', select('center_id', opts(app.s.centers), st.center_id)) : `<input type="hidden" name="center_id" value="${esc(st.center_id || '')}">`}
      ${!isNew ? field('Statut', select('status', [{ value: 'active', label: 'Actif' }, { value: 'inactive', label: 'Inactif (parti)' }], st.status)) : ''}
      ${field('Notes', textarea('notes', st.notes, 2), 'full')}
      ${enrollBlock}</div>`,
    onOpen(ov) {
      const gSel = ov.querySelector('[name=group_id]'), price = ov.querySelector('[name=monthly_price]');
      if (gSel) gSel.addEventListener('change', () => { const g = app.by('groups', gSel.value); price.value = g ? groupPrice(app, g) : ''; });
    },
    onSubmit: async d => {
      const row = { full_name: d.full_name, phone: nullIfEmpty(d.phone), parent_name: nullIfEmpty(d.parent_name), parent_phone: nullIfEmpty(d.parent_phone),
        level_id: nullIfEmpty(d.level_id), school: nullIfEmpty(d.school), center_id: nullIfEmpty(d.center_id), notes: nullIfEmpty(d.notes) };
      if (!isNew) row.status = d.status;
      const saved = await app.save('ctr_students', row, isNew ? null : st.id);
      if (isNew && d.group_id) {
        const e = await app.save('ctr_enrollments', { student_id: saved.id, group_id: d.group_id, start_date: d.start_date || L.today(),
          end_date: nullIfEmpty(d.end_date), monthly_price: num(d.monthly_price) ?? groupPrice(app, app.by('groups', d.group_id)) });
        await app.run(() => invoiceNewEnrollment(app, e));
      }
      toast(isNew ? 'Étudiant ajouté.' : 'Étudiant mis à jour.');
      await app.refresh('students', 'enrollments', 'invoices');
      return saved;
    },
  });
}

export async function enrollDialog(app, { student = null, group = null, enrollment = null } = {}) {
  const e = enrollment || {};
  const isNew = !enrollment;
  const students = app.s.students.filter(s => s.status === 'active');
  const takenGroups = student ? new Set(app.s.enrollments.filter(x => x.student_id === student.id).map(x => x.group_id)) : new Set();
  const groups = app.s.groups.filter(g => g.active && (!isNew || !takenGroups.has(g.id)));
  const g0 = group || (e.group_id && app.by('groups', e.group_id));
  return modal({
    title: isNew ? 'Inscrire à un groupe' : 'Modifier l\'inscription',
    body: `<div class="form-grid">
      ${student || !isNew ? `<input type="hidden" name="student_id" value="${esc(student?.id || e.student_id)}"><div class="full"><b>${esc(app.name('students', student?.id || e.student_id))}</b></div>`
        : field('Étudiant', select('student_id', opts(students, 'full_name'), '', { empty: 'Choisir…', required: true }), 'full')}
      ${group || !isNew ? `<input type="hidden" name="group_id" value="${esc(g0.id)}">${field('Groupe', `<input value="${esc(g0.name)}" disabled>`)}`
        : field('Groupe', select('group_id', opts(groups, g => groupLabel(app, g)), '', { empty: 'Choisir…', required: true }))}
      ${field('Prix mensuel (' + app.cur + ')', input('monthly_price', isNew ? (g0 ? groupPrice(app, g0) : '') : e.monthly_price, { type: 'number', step: '0.01', min: 0, required: true }))}
      ${field('Début', input('start_date', e.start_date || L.today(), { type: 'date', required: true }))}
      ${field('Fin (optionnel)', input('end_date', e.end_date, { type: 'date' }))}
      ${!isNew ? field('Statut', select('status', [{ value: 'active', label: 'Active' }, { value: 'ended', label: 'Terminée' }], e.status)) : ''}
    </div>`,
    onOpen(ov) {
      const gSel = ov.querySelector('select[name=group_id]'), price = ov.querySelector('[name=monthly_price]');
      if (gSel) gSel.addEventListener('change', () => { const g = app.by('groups', gSel.value); price.value = g ? groupPrice(app, g) : ''; });
    },
    onSubmit: async d => {
      const row = { monthly_price: num(d.monthly_price) ?? 0, start_date: d.start_date, end_date: nullIfEmpty(d.end_date) };
      if (isNew) {
        const g = app.by('groups', d.group_id);
        const count = app.s.enrollments.filter(x => x.group_id === d.group_id && x.status === 'active').length;
        if (g?.capacity && count >= g.capacity) toast(`Attention : le groupe dépasse sa capacité (${g.capacity}).`);
        const saved = await app.save('ctr_enrollments', { ...row, student_id: d.student_id, group_id: d.group_id });
        await app.run(() => invoiceNewEnrollment(app, saved));
      } else {
        row.status = d.status;
        await app.save('ctr_enrollments', row, e.id);
      }
      toast('Inscription enregistrée.');
      await app.refresh('enrollments', 'invoices');
    },
  });
}

export async function paymentDialog(app, { student, invoice = null }) {
  const open = app.fin.invoices.filter(i => i.student_id === student.id && i.remaining > 0 && i.status !== 'cancelled')
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  if (!open.length && !invoice) {
    toast('Aucune facture ouverte pour cet étudiant. Créez d\'abord une facture.', 'err'); return null;
  }
  const inv = invoice || open[0];
  const result = await modal({
    title: 'Encaisser un paiement',
    body: `<div class="form-grid">
      <div class="full"><b>${esc(student.full_name)}</b></div>
      ${field('Facture', select('invoice_id', open.map(i => ({ value: i.id, label: `${invNo(i)} — ${i.description || ''} — reste ${app.money(i.remaining)}` })), inv.id, { required: true }), 'full')}
      ${field('Montant (' + app.cur + ')', input('amount', inv.remaining, { type: 'number', step: '0.01', min: 0.01, required: true }))}
      ${field('Mode', select('method', Object.entries(METHOD).map(([value, label]) => ({ value, label })), 'cash'))}
      ${field('Date', input('paid_at', L.today(), { type: 'date', required: true }))}
      ${field('Référence (chèque / virement)', input('reference', ''))}
      ${field('Note', input('notes', ''), 'full')}
    </div>`,
    submit: 'Encaisser',
    onOpen(ov) {
      const sel = ov.querySelector('[name=invoice_id]'), amt = ov.querySelector('[name=amount]');
      sel.addEventListener('change', () => { const i = app.by('invoices', sel.value); if (i) amt.value = i.remaining; });
    },
    onSubmit: async d => {
      const amount = num(d.amount);
      if (!(amount > 0)) throw new Error('Montant invalide.');
      const saved = await app.save('ctr_payments', { invoice_id: d.invoice_id, student_id: student.id, amount, method: d.method,
        paid_at: d.paid_at, reference: nullIfEmpty(d.reference), notes: nullIfEmpty(d.notes), received_by_name: app.me?.full_name || null });
      await app.refresh('payments');
      return saved;
    },
  });
  if (result && result.id) {
    toast('Paiement enregistré.');
    receiptDialog(app, result);
  }
  return result;
}

export async function invoiceDialog(app, { student = null } = {}) {
  const students = app.s.students.filter(s => s.status === 'active');
  return modal({
    title: 'Nouvelle facture',
    body: `<div class="form-grid">
      ${student ? `<input type="hidden" name="student_id" value="${esc(student.id)}"><div class="full"><b>${esc(student.full_name)}</b></div>`
        : field('Étudiant', select('student_id', opts(students, 'full_name'), '', { empty: 'Choisir…', required: true }), 'full')}
      ${field('Description', input('description', '', { required: true, placeholder: "Frais d'inscription, livre, stage…" }), 'full')}
      ${field('Montant (' + app.cur + ')', input('amount', '', { type: 'number', step: '0.01', min: 0, required: true }))}
      ${field('Échéance', input('due_date', L.today(), { type: 'date', required: true }))}
    </div>`,
    submit: 'Créer la facture',
    onSubmit: async d => {
      await app.save('ctr_invoices', { student_id: d.student_id, description: d.description, amount: num(d.amount), due_date: d.due_date });
      toast('Facture créée.');
      await app.refresh('invoices');
    },
  });
}

export function receiptHtml(app, pay) {
  const st = app.by('students', pay.student_id) || {};
  const inv = pay.invoice_id ? app.by('invoices', pay.invoice_id) : null;
  return `<div class="receipt">
    <div class="rh"><div><h2>${esc(app.org.name)}</h2><div class="small">${esc(app.org.address || app.org.city || '')}${app.org.phone ? ' · ' + esc(app.org.phone) : ''}</div></div>
      <div style="text-align:right"><b>REÇU</b><div class="small">${L.fmtDate(pay.paid_at)}</div></div></div>
    <table>
      <tr><td>Étudiant</td><td style="text-align:right"><b>${esc(st.full_name || '')}</b></td></tr>
      ${inv ? `<tr><td>Facture</td><td style="text-align:right">${invNo(inv)} — ${esc(inv.description || '')}</td></tr>` : ''}
      <tr><td>Mode</td><td style="text-align:right">${METHOD[pay.method] || pay.method}${pay.reference ? ' · ' + esc(pay.reference) : ''}</td></tr>
      <tr><td>Montant reçu</td><td style="text-align:right;font-size:18px"><b>${app.money(pay.amount)}</b></td></tr>
      ${inv ? `<tr><td>Reste à payer</td><td style="text-align:right">${app.money(inv.remaining)}</td></tr>` : ''}
      ${pay.received_by_name ? `<tr><td>Reçu par</td><td style="text-align:right">${esc(pay.received_by_name)}</td></tr>` : ''}
    </table>
    <p class="small" style="margin-top:14px;text-align:center">${esc(app.settings.receipt_footer || '')}</p></div>`;
}

export function receiptDialog(app, pay) {
  const p = app.s.payments.find(x => x.id === pay.id) || pay;
  return modal({
    title: 'Reçu de paiement', body: receiptHtml(app, p), cancel: 'Fermer',
    extra: `<button type="button" class="btn" data-print>${icon('print')}Imprimer</button>${waReceiptBtn(app, p)}`,
    onOpen(ov) {
      ov.querySelector('[data-print]').addEventListener('click', () => printHtml(receiptHtml(app, p)));
    },
  });
}
function waReceiptBtn(app, p) {
  const st = app.by('students', p.student_id); if (!st) return '';
  const link = L.waLink(st.parent_phone || st.phone, `Bonjour ${st.parent_name || st.full_name}, nous confirmons la réception de ${app.money(p.amount)} pour ${st.full_name} le ${L.fmtDate(p.paid_at)}. Merci — ${app.org.name}`);
  return link ? `<a class="btn wa" href="${link}" target="_blank" rel="noopener">${icon('wa')}Envoyer</a>` : '';
}
export function printHtml(html) {
  let el = document.getElementById('print-area');
  if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  el.innerHTML = html; window.print(); setTimeout(() => { el.innerHTML = ''; }, 500);
}

export function exportCsv(filename, header, rows) {
  const escCsv = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [header, ...rows].map(r => r.map(escCsv).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}

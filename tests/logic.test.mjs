import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
let n = 0; const t = (name, fn) => { fn(); n++; };

t('dates', () => {
  assert.equal(L.isoWeekday('2026-11-09'), 1); assert.equal(L.isoWeekday('2026-11-08'), 7);
  assert.equal(L.weekStart('2026-11-08'), '2026-11-02'); assert.equal(L.monthEnd('2026-02-10'), '2026-02-28');
  assert.equal(L.addMonths('2026-12-15', 1), '2027-01-01'); assert.equal(L.hoursBetween('18:30', '20:00'), 1.5);
});
t('invoice status', () => {
  const inv = { amount: 400, due_date: '2026-11-01' };
  assert.equal(L.invoiceStatus(inv, 0, 7, '2026-11-08'), 'pending');
  assert.equal(L.invoiceStatus(inv, 0, 7, '2026-11-09'), 'overdue');
  assert.equal(L.invoiceStatus(inv, 200, 7, '2026-11-05'), 'partial');
  assert.equal(L.invoiceStatus(inv, 200, 7, '2026-11-20'), 'overdue');
  assert.equal(L.invoiceStatus(inv, 400, 0, '2026-12-20'), 'paid');
  assert.equal(L.invoiceStatus({ ...inv, cancelled: true }, 0, 0, '2026-12-20'), 'cancelled');
});
t('finance + student status', () => {
  const invs = [{ id: 'a', student_id: 's', amount: 300, due_date: '2026-10-01' }, { id: 'b', student_id: 's', amount: 300, due_date: '2026-11-01' }];
  const pays = [{ invoice_id: 'a', amount: 300, paid_at: '2026-10-03' }, { invoice_id: 'b', amount: 100, paid_at: '2026-11-02' }];
  const f = L.computeFinance(invs, pays, 7, '2026-11-05');
  assert.deepEqual(f.invoices.map(i => i.status), ['paid', 'partial']);
  assert.equal(f.invoices[1].remaining, 200);
  assert.equal(L.studentPaymentStatus(f.byStudent.get('s')), 'partial');
  const k = L.periodKpis({ invoices: f.invoices, payments: pays, expenses: [{ amount: 50, spent_at: '2026-11-03' }], payouts: [] }, '2026-11-01', '2026-11-30');
  assert.deepEqual(k, { billed: 300, collected: 100, pending: 200, overdue: 0, spent: 50, net: 50 });
});
t('30-day billing from Début', () => {
  const e = { id: 'e1', org_id: 'o', student_id: 's', group_id: 'g', start_date: '2026-10-01', monthly_price: 200, status: 'active' };
  const G = [{ id: 'g', name: 'ISSAM' }];
  // Début = last payment 01/10 → next due 31/10, created from 26/10
  assert.equal(L.nextDue(e), '2026-10-31');
  assert.equal(L.plannedCycles([e], G, [], '2026-10-25').length, 0);
  const r1 = L.plannedCycles([e], G, [], '2026-10-26');
  assert.equal(r1.length, 1); assert.equal(r1[0].due_date, '2026-10-31'); assert.equal(r1[0].description, 'ISSAM — du 31/10 au 29/11');
  // open invoice blocks a second one; overdue after grace
  let f = L.computeFinance([{ ...r1[0], id: 'i1' }], [], 7, '2026-11-09');
  assert.equal(f.invoices[0].status, 'overdue'); assert.equal(L.plannedCycles([e], G, f.invoices, '2026-12-30').length, 0);
  assert.equal(L.openInvoice(e, f.invoices).id, 'i1');
  // paid late on 12/11 → Début 12/11 → next 12/12; early → keeps due date
  assert.equal(L.startAfterPayment(r1[0], '2026-11-12'), '2026-11-12');
  assert.equal(L.startAfterPayment(r1[0], '2026-10-29'), '2026-10-31');
  const e2 = { ...e, start_date: '2026-11-12' };
  f = L.computeFinance([{ ...r1[0], id: 'i1' }], [{ invoice_id: 'i1', amount: 200, paid_at: '2026-11-12' }], 7, '2026-12-08');
  assert.equal(L.plannedCycles([e2], G, f.invoices, '2026-12-08')[0].due_date, '2026-12-12');
  // stale: Début edited by hand → old unpaid invoice (no payment) is stale; paid ones never are
  const legacy = { id: 'x', enrollment_id: 'e1', period_month: '2026-11-01', due_date: '2026-11-01', amount: 200 };
  f = L.computeFinance([legacy, { ...r1[0], id: 'i1' }], [], 7, '2026-11-09');
  assert.deepEqual(L.staleInvoices([e], f.invoices).map(i => i.id), ['x']);
  f = L.computeFinance([legacy], [{ invoice_id: 'x', amount: 50, paid_at: '2026-11-02' }], 7, '2026-11-09');
  assert.equal(L.staleInvoices([e], f.invoices).length, 0);
  // old monthly invoice whose date happens to equal Début is still recognised as stale
  const old = { id: 'm', enrollment_id: 'e1', period_month: '2026-11-01', due_date: '2026-11-01', amount: 200, description: 'ISSAM — novembre 2026' };
  f = L.computeFinance([old], [], 7, '2026-11-09');
  assert.deepEqual(L.staleInvoices([{ ...e, start_date: '2026-11-01' }], f.invoices).map(i => i.id), ['m']);
  const okFirst = { ...L.firstPeriodInvoice({ ...e, start_date: '2026-11-01' }, 'ISSAM'), id: 'k' };
  f = L.computeFinance([okFirst], [], 7, '2026-11-09');
  assert.equal(L.staleInvoices([{ ...e, start_date: '2026-11-01' }], f.invoices).length, 0);
  // first period paid at enrollment
  assert.equal(L.firstPeriodInvoice({ ...e, start_date: '2026-11-09' }, 'ISSAM').due_date, '2026-11-09');
  // end date stops billing
  assert.equal(L.plannedCycles([{ ...e, end_date: '2026-10-20' }], G, [], '2026-10-30').length, 0);
});
t('planned sessions', () => {
  const g = [{ id: 'g', org_id: 'o', active: true, start_date: '2026-11-04', teacher_id: 't' }];
  const s = [{ group_id: 'g', weekday: 1, start_time: '18:30:00', end_time: '20:00:00' }, { group_id: 'g', weekday: 3, start_time: '18:30', end_time: '20:00' }];
  const rows = L.plannedSessions(g, s, '2026-11-02', '2026-11-15');
  assert.deepEqual(rows.map(r => r.date), ['2026-11-04', '2026-11-09', '2026-11-11']);
  assert.equal(rows[0].start_time, '18:30');
});
t('payroll', () => {
  const sessions = [{ teacher_id: 't', date: '2026-11-02', start_time: '18:00', end_time: '19:30', status: 'done' },
    { teacher_id: 't', date: '2026-11-04', start_time: '18:00', end_time: '19:30', status: 'cancelled' },
    { teacher_id: 't', date: '2026-11-20', start_time: '18:00', end_time: '19:30', status: 'scheduled' }];
  const d = { sessions, groups: [{ id: 'g', teacher_id: 't' }], enrollments: [{ id: 'e', group_id: 'g' }], invoices: [{ id: 'i', enrollment_id: 'e' }], payments: [{ invoice_id: 'i', amount: 1000, paid_at: '2026-11-03' }] };
  assert.equal(L.payrollFor({ id: 't', pay_type: 'per_session', pay_rate: 150 }, d, '2026-11-01', '2026-11-07').amount, 150);
  assert.equal(L.payrollFor({ id: 't', pay_type: 'per_hour', pay_rate: 100 }, d, '2026-11-01', '2026-11-07').amount, 150);
  assert.equal(L.payrollFor({ id: 't', pay_type: 'percent', pay_rate: 40 }, d, '2026-11-01', '2026-11-07').amount, 400);
  assert.equal(L.payrollFor({ id: 't', pay_type: 'monthly', pay_rate: 3000 }, d, '2026-11-01', '2026-11-07').amount, 3000);
});
t('phones + templates', () => {
  assert.equal(L.normalizePhone('06 64 46 37 23'), '212664463723');
  assert.equal(L.normalizePhone('+212 664-463723'), '212664463723');
  assert.equal(L.normalizePhone('00212664463723'), '212664463723');
  assert.equal(L.normalizePhone('664463723'), '212664463723');
  assert.equal(L.fillTemplate('Bonjour {parent}, {x}', { parent: 'Ali' }), 'Bonjour Ali, {x}');
  assert.ok(L.waLink('0664463723', 'a b').startsWith('https://wa.me/212664463723?text=a%20b'));
});
t('reminders', () => {
  const st = [{ id: 's', full_name: 'Adam', parent_phone: '0611111111', status: 'active' }];
  const f = L.computeFinance([{ id: 'i1', student_id: 's', enrollment_id: 'e', amount: 300, due_date: '2026-10-01', period_month: '2026-10-01' },
                              { id: 'i2', student_id: 's', enrollment_id: 'e', amount: 300, due_date: '2026-11-01', period_month: '2026-11-01' }], [], 7, '2026-11-06');
  const r = L.buildReminders({ invoices: f.invoices, enrollments: [{ id: 'e', student_id: 's', group_id: 'g', status: 'active', end_date: '2026-11-10' }], students: st,
    groups: [{ id: 'g', name: 'Maths' }], reminderLog: [{ kind: 'soon', invoice_id: 'i2', sent_at: new Date(2026, 10, 6, 10).toISOString() }],
    settings: { late_grace_days: 7, tpl_unpaid: '{eleve} {mois} {reste}', tpl_soon: 's', tpl_renewal: 'r {date}' }, orgName: 'C' }, '2026-11-06');
  assert.deepEqual(r.map(x => x.kind).sort(), ['renewal', 'soon', 'unpaid']);
  assert.equal(r.find(x => x.kind === 'unpaid').text, 'Adam la période du 01/10 au 30/10 300');
  assert.equal(r.find(x => x.kind === 'soon').sent, true);
});
t('waitlist alerts + plans', () => {
  const w = Array.from({ length: 7 }, () => ({ status: 'waiting', level_id: 'l', subject_id: 's' }));
  assert.equal(L.waitlistAlerts(w, 7).length, 1); assert.equal(L.waitlistAlerts(w.slice(1), 7).length, 0);
  assert.deepEqual(L.planLimits({ plan: 'starter' }), { students: 150, centers: 1 });
  assert.deepEqual(L.planLimits({ plan: 'enterprise' }), { students: null, centers: null });
  assert.equal(L.planActive({ plan_ends_at: '2000-01-01' }), false);
});
console.log(`${n} test groups passed`);
t('conflicts', () => {
  const s = [{ group_id: 'a', date: '2026-11-09', start_time: '18:00', end_time: '19:30', teacher_id: 't', room_id: 'r1', status: 'scheduled' },
             { group_id: 'b', date: '2026-11-09', start_time: '19:00', end_time: '20:00', teacher_id: 't', room_id: 'r2', status: 'scheduled' },
             { group_id: 'c', date: '2026-11-09', start_time: '19:30', end_time: '21:00', teacher_id: 'x', room_id: 'r1', status: 'scheduled' },
             { group_id: 'd', date: '2026-11-09', start_time: '18:30', end_time: '19:00', teacher_id: 't', room_id: 'r3', status: 'cancelled' }];
  const c = L.findConflicts(s);
  assert.equal(c.length, 1); assert.equal(c[0].type, 'teacher');
});
console.log('conflicts ok');

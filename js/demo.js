// Demo center with realistic sample data (fictional), generated relative to today.
import { today, addDays, monthStart, addMonths, plannedSessions, cycleDescription, CYCLE_DAYS, LOOKAHEAD_DAYS } from './logic.js';

let n = 0;
const id = p => `${p}-${(++n).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

const FIRST = ['Yassine','Salma','Adam','Imane','Hamza','Khadija','Omar','Aya','Mehdi','Hiba','Ayoub','Zineb','Anas','Rania','Ilyas','Malak','Othmane','Nour','Reda','Lina','Ismail','Douae','Amine','Sara','Bilal','Chaimae','Zakaria','Manal','Karim','Ghita'];
const LAST = ['El Idrissi','Benjelloun','Alaoui','Bennani','Tazi','Chraibi','Lahlou','Fassi','Berrada','Amrani','Ouazzani','Kettani','Saidi','Naciri','Bouzidi','Haddad','Mansouri','Rami','Zerouali','Tahiri'];
const PARENT = ['Mohamed','Fatima','Abdellah','Naima','Rachid','Latifa','Hassan','Samira','Mustapha','Nadia'];

export function seedDemo() {
  n = 0;
  const r = rng(42);
  const pick = a => a[Math.floor(r() * a.length)];
  const t0 = today();
  const org = { id: id('org'), name: 'Centre Al Amal', city: 'Rabat', phone: '0537000000', plan: 'trial',
    plan_ends_at: new Date(Date.now() + 11 * 864e5).toISOString(), join_code: 'AMAL42', invoice_seq: 0, created_at: new Date().toISOString() };
  const user = { id: id('usr'), email: 'demo@daftar.ma' };
  const center = { id: id('ctr'), org_id: org.id, name: 'Al Amal — Agdal', city: 'Rabat', active: true };
  const center2 = { id: id('ctr'), org_id: org.id, name: 'Al Amal — Hay Riad', city: 'Rabat', active: true };
  const levels = ['3ème collège', 'Tronc commun', '1ère Bac', '2ème Bac'].map((name, i) => ({ id: id('lvl'), org_id: org.id, name, sort: i }));
  const subjects = ['Mathématiques', 'Physique-Chimie', 'Français', 'Anglais', 'SVT'].map((name, i) => ({ id: id('sub'), org_id: org.id, name, sort: i }));
  const rooms = ['Salle 1', 'Salle 2', 'Salle 3'].map((name, i) => ({ id: id('room'), org_id: org.id, center_id: i < 2 ? center.id : center2.id, name, capacity: 14 }));
  const prices = [];
  levels.forEach((l, li) => subjects.forEach((s, si) => prices.push({ id: id('prc'), org_id: org.id, level_id: l.id, subject_id: s.id, monthly_price: 250 + li * 50 + (si < 2 ? 50 : 0) })));
  const teachers = [
    ['Mme Bennis', 0, 'per_session', 150], ['M. Ait Lahcen', 1, 'per_hour', 120], ['Mme Sqalli', 2, 'monthly', 3000],
    ['Mr. Daoudi', 3, 'percent', 40], ['Mme Rifi', 4, 'per_session', 140],
  ].map(([full_name, si, pay_type, pay_rate]) => ({ id: id('tch'), org_id: org.id, full_name, phone: '06' + String(Math.floor(r() * 1e8)).padStart(8, '0'),
    subject_ids: [subjects[si].id], pay_type, pay_rate, active: true }));
  const colors = ['#1b3a8c', '#d7262e', '#0e7490', '#9333ea', '#db2777', '#0891b2', '#65a30d', '#b45309'];
  const groupDefs = [
    [3, 0, 0, [[1, '18:00', '19:30'], [4, '18:00', '19:30']]], [2, 0, 0, [[2, '18:00', '19:30'], [6, '10:00', '11:30']]],
    [3, 1, 1, [[3, '17:30', '19:00'], [6, '14:00', '15:30']]], [1, 2, 2, [[2, '17:00', '18:30']]],
    [0, 3, 3, [[3, '15:00', '16:30'], [7, '10:00', '11:30']]], [3, 4, 4, [[5, '18:00', '19:30']]],
    [1, 0, 0, [[1, '16:30', '18:00'], [5, '16:30', '18:00']]], [2, 3, 3, [[4, '19:00', '20:30']]],
  ];
  const groups = [], slots = [];
  const gStart = addMonths(monthStart(t0), -3);
  groupDefs.forEach(([li, si, ti, sl], i) => {
    const g = { id: id('grp'), org_id: org.id, center_id: i % 4 === 3 ? center2.id : center.id, name: `${subjects[si].name.split('-')[0]} — ${levels[li].name}${i === 6 ? ' (G2)' : ''}`,
      level_id: levels[li].id, subject_id: subjects[si].id, teacher_id: teachers[ti].id, room_id: rooms[i % 3].id,
      monthly_price: null, capacity: 14, start_date: gStart, end_date: null, active: true, color: colors[i] };
    groups.push(g);
    for (const [weekday, start_time, end_time] of sl) slots.push({ id: id('slt'), org_id: org.id, group_id: g.id, weekday, start_time, end_time, room_id: g.room_id });
  });
  const students = [], enrollments = [];
  for (let i = 0; i < 64; i++) {
    const g = groups[i % groups.length];
    const last = pick(LAST);
    const s = { id: id('stu'), org_id: org.id, center_id: g.center_id, full_name: `${pick(FIRST)} ${last}`,
      phone: '06' + String(Math.floor(r() * 1e8)).padStart(8, '0'), parent_name: `${pick(PARENT)} ${last}`,
      parent_phone: '06' + String(Math.floor(r() * 1e8)).padStart(8, '0'), level_id: g.level_id, school: pick(['Lycée Moulay Youssef', 'Lycée Descartes', 'Collège Ibn Sina', 'Lycée Al Khansaa']),
      status: i === 63 ? 'inactive' : 'active', created_at: new Date(Date.now() - (90 - i) * 864e5).toISOString() };
    students.push(s);
    const price = prices.find(p => p.level_id === g.level_id && p.subject_id === g.subject_id).monthly_price;
    const start = addDays(gStart, Math.floor(r() * 60));
    enrollments.push({ id: id('enr'), org_id: org.id, student_id: s.id, group_id: g.id, start_date: start,
      end_date: i % 11 === 0 ? addDays(t0, (i % 3) * 3 - 2) : null, monthly_price: price, status: 'active', created_at: s.created_at });
    if (i % 5 === 0) { // second subject for some students
      const g2 = groups[(i + 3) % groups.length];
      const p2 = prices.find(p => p.level_id === g2.level_id && p.subject_id === g2.subject_id).monthly_price;
      enrollments.push({ id: id('enr'), org_id: org.id, student_id: s.id, group_id: g2.id, start_date: start, end_date: null, monthly_price: p2, status: 'active', created_at: s.created_at });
    }
  }
  // 30-day cycles from each enrollment's Début; paying moves Début to the payment date
  const invoices = [], payments = [];
  let seq = 0;
  const gName = new Map(groups.map(g => [g.id, g.name]));
  for (const e of enrollments) {
    let start = e.start_date;
    const pay = (row, amount, date, method) => payments.push({ id: id('pay'), org_id: org.id, invoice_id: row.id, student_id: e.student_id, amount, method, paid_at: date, received_by_name: 'Accueil', created_at: date + 'T10:00:00Z' });
    while (start <= addDays(t0, LOOKAHEAD_DAYS)) {
      if (e.end_date && start > e.end_date) break;
      const row = { id: id('inv'), org_id: org.id, student_id: e.student_id, enrollment_id: e.id, period_month: start, number: ++seq, cancelled: false,
        description: cycleDescription(gName.get(e.group_id), start), amount: e.monthly_price, due_date: start, issued_at: start + 'T08:00:00Z' };
      invoices.push(row);
      const x = r(), method = x < .8 ? 'cash' : x < .92 ? 'transfer' : 'cheque';
      const paidOn = addDays(start, Math.floor(r() * 9) - 2);   // 2 days early … 6 days late
      if (paidOn > t0 || x > .9) { if (x > .9 && paidOn <= t0) pay(row, Math.round(e.monthly_price / 2), paidOn, method); break; }
      pay(row, e.monthly_price, paidOn, method);
      e.start_date = paidOn > start ? paidOn : start;            // Début = last payment
      start = addDays(e.start_date, CYCLE_DAYS);
    }
  }
  org.invoice_seq = seq;
  const sessions = plannedSessions(groups, slots, addDays(t0, -45), addDays(t0, 14)).map(s => ({ ...s, id: id('ses'), status: s.date < t0 ? 'done' : 'scheduled' }));
  const attendance = [];
  for (const s of sessions.filter(x => x.status === 'done' && x.date >= addDays(t0, -10))) {
    for (const e of enrollments.filter(e => e.group_id === s.group_id && e.start_date <= s.date)) {
      const x = r(); attendance.push({ session_id: s.id, student_id: e.student_id, org_id: org.id, status: x < .86 ? 'present' : x < .94 ? 'absent' : 'late', marked_at: s.date + 'T20:00:00Z' });
    }
  }
  const cats = [['Loyer', 6000], ['Électricité / Eau', 650], ['Internet', 300], ['Fournitures', 420], ['Marketing', 800]];
  const expenses = [];
  for (let m = -3; m <= 0; m++) for (const [category, amount] of cats) {
    const d = addDays(addMonths(monthStart(t0), m), 4);
    if (d <= t0) expenses.push({ id: id('exp'), org_id: org.id, center_id: center.id, category, description: category, amount, spent_at: d });
  }
  const waitlist = [];
  for (let i = 0; i < 9; i++) {
    const both = i < 7; // 7 requests for the same level+subject → alert
    waitlist.push({ id: id('wl'), org_id: org.id, center_id: center.id, full_name: `${pick(FIRST)} ${pick(LAST)}`, phone: '06' + String(Math.floor(r() * 1e8)).padStart(8, '0'),
      level_id: both ? levels[3].id : levels[0].id, subject_id: both ? subjects[4].id : subjects[2].id, status: 'waiting',
      created_at: new Date(Date.now() - i * 2 * 864e5).toISOString() });
  }
  const settings = { org_id: org.id, currency: 'DH', late_grace_days: 7, waitlist_threshold: 7, auto_invoices: true,
    tpl_unpaid: 'Bonjour {parent}, petit rappel de {centre} : le paiement de {mois} pour {eleve} ({groupe}) reste à régler. Montant restant : {reste} DH. Merci 🙏',
    tpl_soon: 'Bonjour {parent}, le paiement de {mois} pour {eleve} ({groupe}) est de {montant} DH, à régler avant le {date}. Merci — {centre}',
    tpl_renewal: "Bonjour {parent}, l'inscription de {eleve} au groupe {groupe} se termine le {date}. Souhaitez-vous la renouveler ? — {centre}",
    receipt_footer: 'Merci pour votre confiance.' };
  const members = [
    { id: id('mem'), org_id: org.id, user_id: user.id, full_name: 'Directeur (démo)', email: user.email, role: 'owner', status: 'active' },
    { id: id('mem'), org_id: org.id, user_id: id('usr'), full_name: 'Salma Accueil', email: 'accueil@exemple.ma', role: 'staff', status: 'active' },
    { id: id('mem'), org_id: org.id, user_id: id('usr'), full_name: 'Youssef Nouveau', email: 'youssef@exemple.ma', role: 'teacher', status: 'pending' },
  ];
  return {
    __user: user, ctr_organizations: [org], ctr_platform_admins: [], ctr_settings: [settings], ctr_centers: [center, center2],
    ctr_levels: levels, ctr_subjects: subjects, ctr_rooms: rooms, ctr_prices: prices, ctr_teachers: teachers, ctr_members: members,
    ctr_groups: groups, ctr_group_slots: slots, ctr_sessions: sessions, ctr_students: students, ctr_enrollments: enrollments,
    ctr_attendance: attendance, ctr_waitlist: waitlist, ctr_invoices: invoices, ctr_payments: payments, ctr_expenses: expenses,
    ctr_teacher_payouts: [], ctr_reminder_log: [],
  };
}

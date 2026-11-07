// Weekly timetable and attendance.
import { esc, icon, modal, field, input, select, opts, nullIfEmpty, toast, emptyState } from '../ui.js';
import * as L from '../logic.js';
import { pageHead } from './core.js';

export async function attendanceDialog(app, sessionId) {
  let s = app.s.sessions.find(x => x.id === sessionId);
  if (!s) { const r = await app.api.list('ctr_sessions', { eq: { id: sessionId } }); s = r[0]; }
  if (!s) { toast('Séance introuvable.', 'err'); return; }
  const g = app.by('groups', s.group_id) || {};
  const roster = app.s.enrollments.filter(e => e.group_id === s.group_id && e.start_date <= s.date && (!e.end_date || e.end_date >= s.date) && (e.status === 'active' || (e.end_date && e.end_date >= s.date)))
    .map(e => app.by('students', e.student_id)).filter(Boolean).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const existing = await app.api.list('ctr_attendance', { eq: { session_id: s.id } }).catch(() => []);
  const cur = new Map(existing.map(a => [a.student_id, a.status]));
  const canEdit = app.active && (app.isStaff || app.isTeacher);
  const opt = (sid, val, cls, label) => `<label><input type="radio" name="st_${sid}" value="${val}"${(cur.get(sid) || 'present') === val ? ' checked' : ''}${canEdit ? '' : ' disabled'}><span class="${cls}">${label}</span></label>`;
  const body = `<div class="small muted" style="margin-bottom:10px">${L.DAYS[L.isoWeekday(s.date)]} ${L.fmtDate(s.date)} · ${L.fmtTime(s.start_time)}–${L.fmtTime(s.end_time)} · ${esc(app.name('teachers', s.teacher_id, 'Sans enseignant'))}
      ${s.status === 'cancelled' ? ' · <span class="badge b-cancelled">Annulée</span>' : existing.length ? ' · <span class="badge b-paid">Présences prises</span>' : ''}</div>
    ${roster.length ? `${canEdit ? '<div style="margin-bottom:6px"><button type="button" class="btn sm" data-all>Tout le monde présent</button></div>' : ''}
      ${roster.map(st => `<div class="att-row"><div><div class="cell-main">${esc(st.full_name)}</div></div><div class="att-opts">
        ${opt(st.id, 'present', 'p', 'P')}${opt(st.id, 'absent', 'a', 'A')}${opt(st.id, 'late', 'l', 'R')}${opt(st.id, 'excused', 'e', 'E')}</div></div>`).join('')}
      <p class="small muted" style="margin-top:10px">P = présent · A = absent · R = en retard · E = excusé</p>`
      : emptyState('Aucun étudiant inscrit à cette date', '', '', 'users')}
    ${field('Note de séance', input('notes', s.notes || '', { placeholder: 'Chapitre vu, devoirs…' }))}`;
  const extra = canEdit ? (s.status === 'cancelled'
    ? '<button type="button" class="btn" data-restore>Rétablir la séance</button>'
    : '<button type="button" class="btn danger" data-cancel>Annuler la séance</button>') : '';
  await modal({
    title: g.name || 'Séance', body, extra, submit: 'Enregistrer les présences', wide: false,
    onOpen(ov, close) {
      ov.querySelector('[data-all]')?.addEventListener('click', () => ov.querySelectorAll('input[value=present]').forEach(r => { r.checked = true; }));
      const setStatus = async status => {
        await app.save('ctr_sessions', { status }, s.id);
        toast(status === 'cancelled' ? 'Séance annulée.' : 'Séance rétablie.');
        await app.loadSessions(app.sessionsRange.from, app.sessionsRange.to, true); app.render(); close(true);
      };
      ov.querySelector('[data-cancel]')?.addEventListener('click', () => setStatus('cancelled').catch(() => {}));
      ov.querySelector('[data-restore]')?.addEventListener('click', () => setStatus('scheduled').catch(() => {}));
    },
    onSubmit: canEdit ? async (d) => {
      const rows = roster.map(st => ({ session_id: s.id, student_id: st.id, org_id: app.org.id, status: d['st_' + st.id] || 'present', marked_at: new Date().toISOString() }));
      await app.run(async () => {
        if (rows.length) await app.api.insert('ctr_attendance', rows, { onConflict: 'session_id,student_id' });
        await app.api.update('ctr_sessions', { id: s.id }, { status: s.status === 'cancelled' ? 'cancelled' : 'done', notes: nullIfEmpty(d.notes) });
      });
      const absent = rows.filter(r => r.status === 'absent').length;
      toast(`Présences enregistrées${absent ? ` — ${absent} absent(s)` : ''}.`);
      await app.loadSessions(app.sessionsRange.from, app.sessionsRange.to, true); app.render();
    } : undefined,
  });
}

async function extraSessionDialog(app, date) {
  const groups = app.s.groups.filter(g => g.active);
  return modal({
    title: 'Séance ponctuelle (rattrapage, examen blanc…)',
    body: `<div class="form-grid">
      ${field('Groupe', select('group_id', opts(groups), '', { empty: 'Choisir…', required: true }), 'full')}
      ${field('Date', input('date', date, { type: 'date', required: true }))}
      ${field('Salle', select('room_id', opts(app.s.rooms), '', { empty: 'Salle du groupe' }))}
      ${field('Début', input('start_time', '18:00', { type: 'time', required: true }))}
      ${field('Fin', input('end_time', '19:30', { type: 'time', required: true }))}</div>`,
    submit: 'Ajouter',
    onSubmit: async d => {
      if (d.end_time <= d.start_time) throw new Error('La fin doit être après le début.');
      const g = app.by('groups', d.group_id);
      await app.save('ctr_sessions', { group_id: g.id, date: d.date, start_time: d.start_time, end_time: d.end_time, teacher_id: g.teacher_id, room_id: nullIfEmpty(d.room_id) || g.room_id, status: 'scheduled' });
      toast('Séance ajoutée.');
      await app.loadSessions(app.sessionsRange.from, app.sessionsRange.to, true); app.render();
    },
  });
}

// ---------------------------------------------------------------- Hourly time grid (shared)
const SLOT = 48; // px per 30 minutes
const mins = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export function isLive(s, t = L.today()) {
  const n = nowMins();
  return s.date === t && s.status !== 'cancelled' && mins(s.start_time) <= n && n < mins(s.end_time);
}
export function sessionStats(list) {
  const t = L.today();
  const range = list.length ? `${hhmm(Math.min(...list.map(s => mins(s.start_time))))}-${hhmm(Math.max(...list.map(s => mins(s.end_time))))}` : '';
  return { today: list.filter(s => s.date === t && s.status !== 'cancelled').length, live: list.filter(s => isLive(s, t)).length, range };
}

/** Columns = days; events placed by time. Returns the desktop grid plus a stacked list for phones. */
export function timeGrid(app, days, sessions, { labels } = {}) {
  const t = L.today();
  const vis = sessions.filter(s => days.includes(s.date));
  let start = 9 * 60, end = 20 * 60;
  if (vis.length) {
    start = Math.min(start, Math.floor(Math.min(...vis.map(s => mins(s.start_time))) / 30) * 30 - 30);
    end = Math.max(end, Math.ceil(Math.max(...vis.map(s => mins(s.end_time))) / 30) * 30 + 30);
  }
  start = Math.max(0, start); end = Math.min(24 * 60, end);
  const rows = (end - start) / 30;
  const cols = `76px repeat(${days.length}, minmax(140px, 1fr))`;
  const ev = s => {
    const g = app.by('groups', s.group_id) || {};
    const top = (mins(s.start_time) - start) / 30 * SLOT + 2, h = Math.max(SLOT - 6, (mins(s.end_time) - mins(s.start_time)) / 30 * SLOT - 4);
    const tag = s.status === 'cancelled' ? 'Annulée' : s.status === 'done' ? 'Terminé' : isLive(s, t) ? 'En direct' : '';
    return `<div class="tg-ev ${s.status}" style="top:${top}px;height:${h}px" data-act="openSession" data-id="${s.id}" role="button" tabindex="0" title="${esc(g.name || '')}">
      <div class="t1"><span class="dot" style="background:${esc(g.color || 'var(--blue)')}"></span><span class="nm">${esc(g.name || '')}</span></div>
      <div class="t2">${L.fmtTime(s.start_time)}-${L.fmtTime(s.end_time)}${tag ? ` · <span class="tag"${tag === 'En direct' ? ' style="color:var(--red)"' : ''}>${tag}</span>` : ''}${h > 70 ? `<br>${esc(app.name('teachers', s.teacher_id, ''))}${s.room_id ? ' · ' + esc(app.name('rooms', s.room_id)) : ''}` : ''}</div></div>`;
  };
  const n = nowMins(), showNow = days.includes(t) && n >= start && n <= end;
  const head = `<div class="tg-head" style="grid-template-columns:${cols}"><div class="tg-hcell">HEURE</div>${days.map((d, i) => {
    const count = vis.filter(s => s.date === d && s.status !== 'cancelled').length;
    return `<div class="tg-hcell${d === t ? ' today' : ''}"><div class="d"><span>${L.DAYS_SHORT[L.isoWeekday(d)]}.</span><b>${count}</b></div><div class="s">${labels ? esc(labels[i]) + ' · ' : ''}${L.parse(d).getDate()} ${L.MONTHS_SHORT[L.parse(d).getMonth()]}</div></div>`; }).join('')}</div>`;
  const body = `<div class="tg-body" style="grid-template-columns:${cols};--slot:${SLOT}px">
    <div class="tg-times">${Array.from({ length: rows }, (_, i) => `<div class="tg-time">${hhmm(start + i * 30)}</div>`).join('')}</div>
    ${days.map(d => `<div class="tg-col${d === t ? ' today' : ''}" style="height:${rows * SLOT}px">${vis.filter(s => s.date === d).map(ev).join('')}${d === t && showNow ? `<div class="tg-now" style="top:${(n - start) / 30 * SLOT}px"></div>` : ''}</div>`).join('')}</div>`;
  const list = `<div class="week-list">${days.map((d, i) => { const l = vis.filter(s => s.date === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    return `<div class="day-l${d === t ? ' today' : ''}"><h3>${labels ? esc(labels[i]) + ' · ' : ''}${L.DAYS[L.isoWeekday(d)]} ${L.fmtDate(d, false)}</h3>${l.map(s => { const g = app.by('groups', s.group_id) || {};
      return `<div class="sess ${s.status}" data-act="openSession" data-id="${s.id}"><div class="t1"><span class="chip"><span class="sw" style="background:${esc(g.color || 'var(--blue)')}"></span>${esc(g.name || '')}</span></div><div class="t2">${L.fmtTime(s.start_time)}-${L.fmtTime(s.end_time)} · ${esc(app.name('teachers', s.teacher_id, ''))}${s.status === 'done' ? ' · Terminé' : ''}</div></div>`; }).join('') || '<div class="muted small">Aucune séance</div>'}</div>`; }).join('')}</div>`;
  return `<div class="week-grid table-wrap"><div class="tg" style="min-width:${76 + days.length * 140}px">${head}${body}</div></div>${list}`;
}

export function filterSessions(app, list, st) {
  return list.filter(s => {
    const g = app.by('groups', s.group_id); if (!g || !app.inCenter(g)) return false;
    if (st.teacher && s.teacher_id !== st.teacher) return false;
    if (st.room && s.room_id !== st.room) return false;
    if (st.group && s.group_id !== st.group) return false;
    if (st.status === 'live' && !isLive(s)) return false;
    if (st.status && st.status !== 'live' && s.status !== st.status) return false;
    if (st.q && !L.matches(st.q, g.name, app.name('teachers', s.teacher_id, ''), app.name('rooms', s.room_id, ''))) return false;
    return true;
  });
}

export const schedule = {
  title: 'Emploi du temps',
  render(app, r) {
    const st = app.viewState;
    const week = st.week || r.q.week || L.weekStart(L.today());
    st.week = week;
    const end = L.addDays(week, 6);
    const covered = app.sessionsRange && week >= app.sessionsRange.from && end <= app.sessionsRange.to;
    const sessions = filterSessions(app, app.s.sessions.filter(s => s.date >= week && s.date <= end), st);
    const days = Array.from({ length: 7 }, (_, i) => L.addDays(week, i));
    const stats = sessionStats(sessions);
    const isThis = week === L.weekStart(L.today());
    const d1 = L.parse(week), d2 = L.parse(end);
    const label = `${d1.getDate()} ${L.MONTHS_SHORT[d1.getMonth()]} – ${d2.getDate()} ${L.MONTHS_SHORT[d2.getMonth()]}`;
    const filters = app.isTeacher ? '' : `
      ${select('teacher', opts(app.s.teachers, 'full_name'), st.teacher || '', { empty: 'Tous les enseignants' }).replace('<select', '<select data-change="filter"')}
      ${select('room', opts(app.s.rooms), st.room || '', { empty: 'Toutes les salles' }).replace('<select', '<select data-change="filter"')}
      ${select('group', opts(app.s.groups.filter(g => g.active)), st.group || '', { empty: 'Tous les groupes' }).replace('<select', '<select data-change="filter"')}`;
    return `<div class="card week-nav"><button class="btn ghost" data-act="prev">${icon('chevL')}<span>Semaine précédente</span></button>
        <div class="mid" data-act="thisWeek" style="cursor:pointer" title="Revenir à cette semaine"><h1>${esc(label)}</h1><span>${isThis ? 'Semaine actuelle' : (week < L.weekStart(L.today()) ? 'Semaine passée' : 'Semaine à venir')}</span></div>
        <button class="btn ghost" data-act="next"><span>Semaine suivante</span>${icon('chevR')}</button></div>
      ${!app.s.slots.length ? `<div class="banner info">${icon('calendar')}<span>Aucun horaire défini. Ajoutez des créneaux à vos groupes : les séances apparaîtront ici automatiquement.</span>${app.isStaff ? '<a class="btn sm" href="#/groups">Groupes</a>' : ''}</div>` : ''}
      <div class="card"><div class="card-head"><h2>${icon('calendar')}Emploi du temps hebdomadaire</h2>
        <div class="actions"><span class="pill">${sessions.filter(s => s.status !== 'cancelled').length} séances · ${stats.today} aujourd'hui · <span class="c-red">${stats.live} en direct</span>${stats.range ? ' · ' + stats.range : ''}</span>
        ${app.isStaff ? `<button class="btn sm" data-act="extra">${icon('plus')}Séance ponctuelle</button>` : ''}</div></div>
        ${filters ? `<div class="toolbar">${filters}</div>` : ''}
        ${covered ? timeGrid(app, days, sessions) : '<div class="card-pad muted">Chargement de la semaine…</div>'}</div>`;
  },
  async after(app) {
    const week = app.viewState.week, end = L.addDays(week, 6);
    const r = app.sessionsRange;
    if (!r || week < r.from || end > r.to) { await app.loadSessions(week < (r?.from || week) ? week : r.from, end > (r?.to || end) ? end : r.to); app.render(); }
  },
  changes: { filter(el, app) { app.viewState[el.name] = el.value; app.render(); } },
  actions: {
    prev(el, app) { app.viewState.week = L.addDays(app.viewState.week, -7); app.render(); },
    next(el, app) { app.viewState.week = L.addDays(app.viewState.week, 7); app.render(); },
    thisWeek(el, app) { app.viewState.week = L.weekStart(L.today()); app.render(); },
    openSession: (el, app) => attendanceDialog(app, el.dataset.id),
    extra: (el, app) => extraSessionDialog(app, L.today()),
  },
};

// ---------------------------------------------------------------- Conflicts
export const conflicts = {
  title: 'Conflits',
  allow: app => app.isStaff,
  render(app) {
    const list = app.conflicts.filter(c => app.inCenter(app.by('groups', c.a.group_id) || {}));
    const row = s => { const g = app.by('groups', s.group_id) || {}; return `<a href="#/groups/${g.id}" class="chip"><span class="sw" style="background:${esc(g.color || 'var(--blue)')}"></span>${esc(g.name || '')}</a> <span class="small muted">${L.fmtTime(s.start_time)}-${L.fmtTime(s.end_time)}</span>`; };
    return `${pageHead('Conflits', "Enseignants ou salles réservés deux fois au même moment, sur les séances à venir.")}
      <div class="card">${list.length ? `<div class="list">${list.map(c => `<div class="list-item" style="align-items:flex-start">
        <span class="note-ic red">${icon(c.type === 'teacher' ? 'teacher' : 'door')}</span>
        <div class="grow"><div class="cell-main">${c.type === 'teacher' ? `${esc(app.name('teachers', c.a.teacher_id))} a deux cours en même temps` : `${esc(app.name('rooms', c.a.room_id))} est occupée deux fois`}</div>
          <div class="cell-sub" style="margin-bottom:8px">${L.DAYS[L.isoWeekday(c.a.date)]} ${L.fmtDate(c.a.date)}</div>
          <div class="chips" style="gap:10px;align-items:center">${row(c.a)} <span class="c-red">↔</span> ${row(c.b)}</div></div>
        <button class="btn sm" data-act="openSession" data-id="${c.b.id}">Ouvrir la séance</button></div>`).join('')}</div>`
        : emptyState('Aucun conflit', 'Aucun enseignant ni aucune salle n\'est réservé deux fois sur les 5 prochaines semaines.', '', 'check')}</div>`;
  },
  actions: { openSession: (el, app) => attendanceDialog(app, el.dataset.id) },
};

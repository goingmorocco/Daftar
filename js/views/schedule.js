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
      : emptyState('Aucun élève inscrit à cette date', '', '', 'users')}
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

export const schedule = {
  title: 'Emploi du temps',
  render(app, r) {
    const st = app.viewState;
    const week = st.week || r.q.week || L.weekStart(L.today());
    st.week = week;
    const end = L.addDays(week, 6);
    const t = L.today();
    const covered = app.sessionsRange && week >= app.sessionsRange.from && end <= app.sessionsRange.to;
    const sessions = app.s.sessions.filter(s => s.date >= week && s.date <= end).filter(s => {
      const g = app.by('groups', s.group_id); if (!g || !app.inCenter(g)) return false;
      if (st.teacher && s.teacher_id !== st.teacher) return false;
      if (st.room && s.room_id !== st.room) return false;
      if (st.group && s.group_id !== st.group) return false;
      return true;
    });
    const days = Array.from({ length: 7 }, (_, i) => L.addDays(week, i));
    const hasSlots = app.s.slots.length > 0;
    const filters = app.isTeacher ? '' : `
      ${select('teacher', opts(app.s.teachers, 'full_name'), st.teacher || '', { empty: 'Tous les enseignants' }).replace('<select', '<select data-change="filter"')}
      ${select('room', opts(app.s.rooms), st.room || '', { empty: 'Toutes les salles' }).replace('<select', '<select data-change="filter"')}
      ${select('group', opts(app.s.groups.filter(g => g.active)), st.group || '', { empty: 'Tous les groupes' }).replace('<select', '<select data-change="filter"')}`;
    return `${pageHead('Emploi du temps', `Semaine du ${L.fmtDate(week, false)} au ${L.fmtDate(end)}`,
      `<div class="seg"><button data-act="prev" aria-label="Semaine précédente">${icon('chevL')}</button><button data-act="thisWeek">Cette semaine</button><button data-act="next" aria-label="Semaine suivante">${icon('chevR')}</button></div>
       ${app.isStaff ? `<button class="btn" data-act="extra">${icon('plus')}Séance ponctuelle</button>` : ''}`)}
      ${filters ? `<div class="actions" style="margin-bottom:14px">${filters}</div>` : ''}
      ${!hasSlots ? `<div class="banner info">${icon('calendar')}<span>Aucun horaire défini. Ajoutez des créneaux à vos groupes : les séances apparaîtront ici automatiquement.</span>${app.isStaff ? '<a class="btn sm" href="#/groups">Groupes</a>' : ''}</div>` : ''}
      ${!covered ? '<div class="card card-pad muted">Chargement de la semaine…</div>' : `<div class="week">${days.map(d => {
        const list = sessions.filter(s => s.date === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
        return `<div class="day${d === t ? ' today' : ''}"><div class="day-head"><span>${L.DAYS_SHORT[L.isoWeekday(d)]} ${L.fmtDate(d, false)}</span><span class="muted">${list.length || ''}</span></div>
          <div class="day-body">${list.map(s => { const g = app.by('groups', s.group_id) || {}; return `<div class="sess ${s.status}" style="border-left-color:${esc(g.color || 'var(--primary)')}" data-act="open" data-id="${s.id}" role="button" tabindex="0">
            <div class="t1">${L.fmtTime(s.start_time)}–${L.fmtTime(s.end_time)}</div><div>${esc(g.name || '')}</div>
            <div class="t2">${esc(app.name('teachers', s.teacher_id, ''))}${s.room_id ? ' · ' + esc(app.name('rooms', s.room_id)) : ''}${s.status === 'done' ? ' · ✓' : ''}</div></div>`; }).join('')}</div></div>`; }).join('')}</div>`}`;
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
    open: (el, app) => attendanceDialog(app, el.dataset.id),
    extra: (el, app) => extraSessionDialog(app, L.today()),
  },
};

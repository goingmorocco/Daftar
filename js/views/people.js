// Teachers & payroll, waiting list, team.
import { esc, icon, modal, field, input, select, opts, nullIfEmpty, num, toast, emptyState, confirmBox, copyText } from '../ui.js';
import * as L from '../logic.js';
import { pageHead, kpi, groupDialog } from './core.js';
import { studentDialog } from './common.js';

// ---------------------------------------------------------------- Teachers
async function teacherDialog(app, t = null) {
  const isNew = !t; t = t || { pay_type: 'per_session', pay_rate: 0, active: true, subject_ids: [] };
  return modal({
    title: isNew ? 'Nouvel enseignant' : 'Modifier l\'enseignant',
    body: `<div class="form-grid">
      ${field('Nom complet', input('full_name', t.full_name, { required: true }), 'full')}
      ${field('Téléphone', input('phone', t.phone, { type: 'tel' }))}
      ${field('E-mail', input('email', t.email, { type: 'email' }))}
      ${field('Mode de paie', select('pay_type', Object.entries(L.PAY_LABEL).map(([value, label]) => ({ value, label })), t.pay_type))}
      ${field('Tarif', input('pay_rate', t.pay_rate, { type: 'number', step: '0.01', min: 0 }))}
      <div class="full small muted" id="rate-help"></div>
      <div class="full"><div class="small" style="font-weight:600;margin-bottom:6px">Matières enseignées</div><div class="chips">
        ${app.s.subjects.map(s => `<label class="check chip"><input type="checkbox" name="subject_ids" data-multi value="${s.id}"${(t.subject_ids || []).includes(s.id) ? ' checked' : ''}> ${esc(s.name)}</label>`).join('') || '<span class="muted small">Ajoutez des matières dans Réglages.</span>'}</div></div>
      ${!isNew ? '<label class="check"><input type="checkbox" name="active"' + (t.active ? ' checked' : '') + '> Actif</label>' : ''}
    </div>`,
    onOpen(ov) {
      const sel = ov.querySelector('[name=pay_type]'), help = ov.querySelector('#rate-help');
      const h = { per_session: `${app.cur} par séance donnée.`, per_hour: `${app.cur} par heure de cours.`, monthly: `${app.cur} fixe par mois.`, percent: 'Pourcentage des encaissements de ses groupes (ex. 40).' };
      const upd = () => { help.textContent = h[sel.value]; }; sel.addEventListener('change', upd); upd();
    },
    onSubmit: async d => {
      const row = { full_name: d.full_name, phone: nullIfEmpty(d.phone), email: nullIfEmpty(d.email), pay_type: d.pay_type, pay_rate: num(d.pay_rate) ?? 0, subject_ids: d.subject_ids || [] };
      if (!isNew) row.active = !!d.active;
      await app.save('ctr_teachers', row, isNew ? null : t.id);
      toast('Enseignant enregistré.'); await app.refresh('teachers');
    },
  });
}

export const teachers = {
  title: 'Enseignants',
  allow: app => app.isStaff,
  render(app, r) {
    const st = app.viewState; st.month ||= L.monthStart(L.today());
    const tab = app.isManager ? (r.q.tab || 'list') : 'list';
    const groupsBy = new Map(); for (const g of app.s.groups) if (g.active && g.teacher_id) (groupsBy.get(g.teacher_id) || groupsBy.set(g.teacher_id, []).get(g.teacher_id)).push(g);
    let body;
    if (tab === 'list') {
      const list = app.s.teachers.slice().sort((a, b) => (b.active - a.active) || a.full_name.localeCompare(b.full_name));
      body = `<div class="card">${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Enseignant</th><th class="hide-sm">Matières</th><th>Groupes</th><th>Paie</th>${app.isManager ? '<th></th>' : ''}</tr></thead><tbody>
        ${list.map(t => `<tr><td><div class="cell-main">${esc(t.full_name)} ${t.active ? '' : '<span class="badge b-cancelled">Inactif</span>'}</div><div class="cell-sub">${esc(t.phone || t.email || '')}</div></td>
          <td class="hide-sm"><div class="chips">${(t.subject_ids || []).map(id => `<span class="chip">${esc(app.name('subjects', id, ''))}</span>`).join('')}</div></td>
          <td><div class="chips">${(groupsBy.get(t.id) || []).map(g => `<a class="chip" href="#/groups/${g.id}"><span class="sw" style="background:${esc(g.color || 'var(--primary)')}"></span>${esc(g.name)}</a>`).join('') || '<span class="muted small">—</span>'}</div></td>
          <td class="nowrap">${esc(L.PAY_LABEL[t.pay_type])}<div class="cell-sub">${t.pay_type === 'percent' ? Number(t.pay_rate) + ' %' : app.money(t.pay_rate)}</div></td>
          ${app.isManager ? `<td class="r"><button class="btn sm ghost" data-act="edit" data-id="${t.id}">${icon('edit')}</button></td>` : ''}</tr>`).join('')}
        </tbody></table></div>` : emptyState('Aucun enseignant', 'Ajoutez vos enseignants et leur mode de paie.', app.isManager ? `<button class="btn primary" data-act="new">${icon('plus')}Nouvel enseignant</button>` : '', 'teacher')}</div>`;
    } else {
      const ms = st.month, me = L.monthEnd(ms);
      const covered = app.sessionsRange && ms >= app.sessionsRange.from && me <= app.sessionsRange.to;
      if (!covered) body = '<div class="card card-pad muted">Chargement des séances du mois…</div>';
      else {
        const data = { sessions: app.s.sessions, groups: app.s.groups, payments: app.s.payments, invoices: app.s.invoices, enrollments: app.s.enrollments };
        const rows = app.s.teachers.filter(t => t.active || app.s.payouts.some(p => p.teacher_id === t.id && p.month === ms))
          .map(t => ({ t, calc: L.payrollFor(t, data, ms), po: app.s.payouts.find(p => p.teacher_id === t.id && String(p.month).slice(0, 10) === ms) }));
        const total = rows.reduce((s, x) => s + (x.po?.status === 'paid' ? Number(x.po.amount) : x.calc.amount), 0);
        const paid = rows.filter(x => x.po?.status === 'paid').reduce((s, x) => s + Number(x.po.amount), 0);
        body = `<div class="kpis k4">${kpi('Paie du mois', `${L.money(total, '').trim()}<small>${esc(app.cur)}</small>`)}${kpi('Déjà versé', `${L.money(paid, '').trim()}<small>${esc(app.cur)}</small>`, 'ok')}${kpi('Reste à verser', `${L.money(total - paid, '').trim()}<small>${esc(app.cur)}</small>`, total - paid > 0 ? 'warn' : '')}${kpi('Enseignants', String(rows.length))}</div>
          <div class="card">${rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Enseignant</th><th>Séances</th><th class="hide-sm">Calcul</th><th class="r">Montant</th><th>Statut</th><th></th></tr></thead><tbody>
          ${rows.map(({ t, calc, po }) => `<tr><td class="cell-main">${esc(t.full_name)}</td><td class="num">${calc.sessions}<div class="cell-sub">${calc.hours} h</div></td>
            <td class="hide-sm small">${esc(calc.basis)}</td><td class="r num"><b>${app.money(po?.status === 'paid' ? po.amount : calc.amount)}</b></td>
            <td>${po?.status === 'paid' ? `<span class="badge b-paid">Versé le ${L.fmtDate(po.paid_at, false)}</span>` : '<span class="badge b-pending">À verser</span>'}</td>
            <td class="r nowrap">${po?.status === 'paid' ? `<button class="btn sm ghost" data-act="unpay" data-id="${po.id}">Annuler</button>` : `<button class="btn sm primary" data-act="payout" data-id="${t.id}" data-amount="${calc.amount}" data-sessions="${calc.sessions}" data-hours="${calc.hours}">Marquer versé</button>`}</td></tr>`).join('')}
          </tbody></table></div>` : emptyState('Aucun enseignant actif', '', '', 'teacher')}</div>
          <p class="small muted" style="margin-top:10px">Calculé à partir des séances non annulées jusqu'à aujourd'hui. Les montants versés apparaissent dans les dépenses du mois.</p>`;
      }
    }
    return `${pageHead('Enseignants', 'Les cours de chacun, ses matières, et sa paie calculée chaque mois.',
      `${tab === 'payroll' ? `<div class="seg"><button data-act="prevMonth">${icon('chevL')}</button><button data-act="thisMonth" style="min-width:130px">${esc(L.monthLabel(st.month))}</button><button data-act="nextMonth">${icon('chevR')}</button></div>` : ''}
       ${app.isManager ? `<button class="btn primary" data-act="new">${icon('plus')}Nouvel enseignant</button>` : ''}`)}
      ${app.isManager ? `<div class="tabs"><a href="#/teachers" class="${tab === 'list' ? 'on' : ''}">Enseignants</a><a href="#/teachers?tab=payroll" class="${tab === 'payroll' ? 'on' : ''}">Paie du mois</a></div>` : ''}${body}`;
  },
  async after(app, r) {
    if (r.q.tab !== 'payroll') return;
    const ms = app.viewState.month, me = L.monthEnd(ms), rg = app.sessionsRange;
    if (!rg || ms < rg.from || me > rg.to) { await app.loadSessions(ms < rg.from ? ms : rg.from, me > rg.to ? me : rg.to); app.render(); }
  },
  actions: {
    new: (el, app) => teacherDialog(app),
    edit: (el, app) => teacherDialog(app, app.by('teachers', el.dataset.id)),
    prevMonth(el, app) { app.viewState.month = L.addMonths(app.viewState.month, -1); app.render(); },
    nextMonth(el, app) { app.viewState.month = L.addMonths(app.viewState.month, 1); app.render(); },
    thisMonth(el, app) { app.viewState.month = L.monthStart(L.today()); app.render(); },
    async payout(el, app) {
      const t = app.by('teachers', el.dataset.id); const ms = app.viewState.month;
      const amount = await modal({ title: `Verser la paie — ${t.full_name}`, body: `<div class="form-grid">${field('Montant (' + app.cur + ')', input('amount', el.dataset.amount, { type: 'number', step: '0.01', min: 0, required: true }))}${field('Date de versement', input('paid_at', L.today(), { type: 'date', required: true }))}${field('Note', input('notes', ''), 'full')}</div>`,
        submit: 'Marquer versé', onSubmit: d => d });
      if (!amount) return;
      await app.run(() => app.api.insert('ctr_teacher_payouts', { org_id: app.org.id, teacher_id: t.id, month: ms, amount: num(amount.amount), sessions_count: Number(el.dataset.sessions), hours: Number(el.dataset.hours),
        status: 'paid', paid_at: amount.paid_at, notes: nullIfEmpty(amount.notes) }, { onConflict: 'teacher_id,month' }), 'Paie enregistrée.');
      await app.refresh('payouts');
    },
    async unpay(el, app) {
      if (!(await confirmBox('Annuler ce versement ?', { ok: 'Annuler le versement' }))) return;
      await app.del('ctr_teacher_payouts', el.dataset.id); toast('Versement annulé.'); await app.refresh('payouts');
    },
  },
};

// ---------------------------------------------------------------- Waiting list
async function waitDialog(app, w = null) {
  const isNew = !w; w = w || { center_id: app.centerId || app.s.centers[0]?.id };
  return modal({
    title: isNew ? 'Ajouter à la liste d\'attente' : 'Modifier la demande',
    body: `<div class="form-grid">
      ${field('Nom de l\'élève', input('full_name', w.full_name, { required: true }), 'full')}
      ${field('Téléphone (WhatsApp)', input('phone', w.phone, { type: 'tel' }))}
      ${field('Nom du parent', input('parent_name', w.parent_name))}
      ${field('Niveau', select('level_id', opts(app.s.levels), w.level_id, { empty: '—' }))}
      ${field('Matière', select('subject_id', opts(app.s.subjects), w.subject_id, { empty: '—' }))}
      ${field('Notes (disponibilités…)', input('notes', w.notes), 'full')}</div>`,
    onSubmit: async d => {
      await app.save('ctr_waitlist', { full_name: d.full_name, phone: nullIfEmpty(d.phone), parent_name: nullIfEmpty(d.parent_name), level_id: nullIfEmpty(d.level_id),
        subject_id: nullIfEmpty(d.subject_id), notes: nullIfEmpty(d.notes), center_id: w.center_id || null }, isNew ? null : w.id);
      toast('Demande enregistrée.'); await app.refresh('waitlist');
    },
  });
}

export const waitlist = {
  title: "Liste d'attente",
  allow: app => app.isStaff,
  render(app) {
    const st = app.viewState;
    const th = app.settings.waitlist_threshold || 7;
    const waiting = app.s.waitlist.filter(w => w.status === 'waiting' && app.inCenter(w));
    const groupsMap = new Map();
    for (const w of waiting) { const k = (w.level_id || '') + '|' + (w.subject_id || ''); (groupsMap.get(k) || groupsMap.set(k, []).get(k)).push(w); }
    const combos = [...groupsMap.entries()].sort((a, b) => b[1].length - a[1].length);
    const list = waiting.filter(w => !st.combo || ((w.level_id || '') + '|' + (w.subject_id || '')) === st.combo).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return `${pageHead("Liste d'attente", `Alerte dès ${th} demandes pour le même niveau et la même matière.`, `<button class="btn primary" data-act="new">${icon('plus')}Ajouter une demande</button>`)}
      ${combos.filter(([, v]) => v.length >= th).map(([k, v]) => { const [l, s] = k.split('|'); return `<div class="banner warn">${icon('alert')}<span>${v.length} demandes pour ${esc(app.name('levels', l, 'tout niveau'))} · ${esc(app.name('subjects', s, 'toute matière'))}. De quoi ouvrir un nouveau groupe.</span><button class="btn sm" data-act="openGroup" data-level="${l}" data-subject="${s}">Créer le groupe</button></div>`; }).join('')}
      <div class="grid grid-2" style="grid-template-columns:1fr 2.2fr">
        <div class="card"><div class="card-head"><h2>Par niveau et matière</h2></div><div class="list">
          <a class="list-item" href="#" data-act="combo" data-k="" style="${!st.combo ? 'background:var(--primary-soft)' : ''}"><div class="grow">Toutes les demandes</div><b>${waiting.length}</b></a>
          ${combos.map(([k, v]) => { const [l, s] = k.split('|'); return `<a class="list-item" href="#" data-act="combo" data-k="${k}" style="${st.combo === k ? 'background:var(--primary-soft)' : ''}"><div class="grow">${esc(app.name('levels', l, 'Niveau ?'))} · ${esc(app.name('subjects', s, 'Matière ?'))}<div class="progress" style="margin-top:4px"><span style="width:${Math.min(100, Math.round(v.length / th * 100))}%;${v.length >= th ? 'background:var(--warn)' : ''}"></span></div></div><b>${v.length}</b></a>`; }).join('')}</div></div>
        <div class="card">${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Demande</th><th class="hide-sm">Niveau · Matière</th><th class="hide-sm">Depuis</th><th></th></tr></thead><tbody>
          ${list.map(w => `<tr><td><div class="cell-main">${esc(w.full_name)}</div><div class="cell-sub">${esc(w.phone || '')}${w.notes ? ' · ' + esc(w.notes) : ''}</div></td>
            <td class="hide-sm">${esc(app.name('levels', w.level_id, '—'))} · ${esc(app.name('subjects', w.subject_id, '—'))}</td><td class="hide-sm nowrap">${L.fmtDate(String(w.created_at).slice(0, 10))}</td>
            <td class="r nowrap">${w.phone ? `<a class="btn sm wa" href="${L.waLink(w.phone, `Bonjour ${w.parent_name || w.full_name}, bonne nouvelle de ${app.org.name} : une place est disponible pour ${w.full_name}. Souhaitez-vous confirmer l'inscription ?`)}" target="_blank" rel="noopener">${icon('wa')}</a>` : ''}
              <button class="btn sm" data-act="enroll" data-id="${w.id}">Inscrire</button><button class="btn sm ghost" data-act="edit" data-id="${w.id}">${icon('edit')}</button><button class="btn sm ghost danger" data-act="cancel" data-id="${w.id}" title="Retirer">${icon('x')}</button></td></tr>`).join('')}
          </tbody></table></div>` : emptyState('Personne en attente', 'Notez ici les demandes pour des groupes complets ou pas encore ouverts.', '', 'clock')}</div></div>`;
  },
  actions: {
    new: (el, app) => waitDialog(app),
    edit: (el, app) => waitDialog(app, app.s.waitlist.find(w => w.id === el.dataset.id)),
    combo(el, app) { app.viewState.combo = el.dataset.k; app.render(); },
    async cancel(el, app) { if (!(await confirmBox('Retirer cette demande de la liste ?', { ok: 'Retirer' }))) return; await app.save('ctr_waitlist', { status: 'cancelled' }, el.dataset.id); toast('Demande retirée.'); await app.refresh('waitlist'); },
    async enroll(el, app) {
      const w = app.s.waitlist.find(x => x.id === el.dataset.id);
      const g = app.s.groups.find(x => x.active && x.level_id === w.level_id && x.subject_id === w.subject_id);
      const s = await studentDialog(app, null, { full_name: w.full_name, phone: w.phone, parent_name: w.parent_name, parent_phone: w.phone,
        level_id: w.level_id, notes: w.notes, group_id: g?.id });
      if (!s?.id) return;
      await app.save('ctr_waitlist', { status: 'enrolled' }, w.id); toast('Élève inscrit et retiré de la liste.'); await app.refresh('waitlist');
    },
    async openGroup(el, app) {
      const g = await groupDialog(app, null, { level_id: el.dataset.level || null, subject_id: el.dataset.subject || null,
        name: [app.name('subjects', el.dataset.subject, ''), app.name('levels', el.dataset.level, '')].filter(Boolean).join(' — ') });
      if (g?.id) app.go('#/groups/' + g.id);
    },
  },
};

// ---------------------------------------------------------------- Team
const ROLES = { owner: 'Admin (propriétaire)', admin: 'Admin', staff: 'Employé', teacher: 'Enseignant' };

export const team = {
  title: 'Équipe',
  allow: app => app.isManager,
  render(app) {
    const members = app.s.members.slice().sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || String(a.full_name).localeCompare(String(b.full_name)));
    const url = location.origin + location.pathname;
    const share = `Rejoignez ${app.org.name} sur ${app.cfg.APP_NAME || 'Daftar'} : ${url} — créez votre compte puis entrez le code d'équipe ${app.org.join_code}`;
    return `${pageHead('Équipe', 'Qui a accès à votre centre, et avec quel rôle.')}
      <div class="card card-pad" style="margin-bottom:16px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <div><div class="small muted" style="font-weight:600">Code d'équipe</div><div class="code-box">${esc(app.org.join_code)}</div></div>
        <div style="flex:1;min-width:220px" class="small muted">Vos collaborateurs créent un compte, choisissent « Rejoindre une équipe » et saisissent ce code. Vous approuvez ensuite leur demande ici.</div>
        <div class="actions"><button class="btn" data-act="copy" data-text="${esc(share)}">${icon('copy')}Copier l'invitation</button>
          <a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(share)}" target="_blank" rel="noopener">${icon('wa')}Partager</a>
          <button class="btn ghost" data-act="regen" title="Nouveau code">${icon('refresh')}</button></div></div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Membre</th><th>Rôle</th><th class="hide-sm">Fiche enseignant</th><th>Statut</th><th></th></tr></thead><tbody>
        ${members.map(m => { const self = m.user_id === app.user.id; const locked = m.role === 'owner' && app.role !== 'owner';
          return `<tr><td><div class="cell-main">${esc(m.full_name || m.email)}${self ? ' <span class="muted small">(vous)</span>' : ''}</div><div class="cell-sub">${esc(m.email || '')}${m.phone ? ' · ' + esc(m.phone) : ''}</div></td>
          <td>${self || locked ? esc(ROLES[m.role]) : `<select data-change="role" data-id="${m.id}">${Object.entries(ROLES).filter(([k]) => k !== 'owner' || app.role === 'owner').map(([k, v]) => `<option value="${k}"${k === m.role ? ' selected' : ''}>${v}</option>`).join('')}</select>`}</td>
          <td class="hide-sm">${m.role === 'teacher' ? `<select data-change="teacher" data-id="${m.id}"><option value="">— Lier à… —</option>${app.s.teachers.map(t => `<option value="${t.id}"${t.id === m.teacher_id ? ' selected' : ''}>${esc(t.full_name)}</option>`).join('')}</select>` : '<span class="muted small">—</span>'}</td>
          <td>${m.status === 'pending' ? '<span class="badge b-partial">En attente</span>' : m.status === 'active' ? '<span class="badge b-paid">Actif</span>' : '<span class="badge b-cancelled">Désactivé</span>'}</td>
          <td class="r nowrap">${self || locked ? '' : m.status === 'pending' ? `<button class="btn sm primary" data-act="approve" data-id="${m.id}">${icon('check')}Approuver</button><button class="btn sm ghost danger" data-act="remove" data-id="${m.id}">Refuser</button>`
            : m.status === 'active' ? `<button class="btn sm ghost" data-act="disable" data-id="${m.id}">Désactiver</button>` : `<button class="btn sm" data-act="approve" data-id="${m.id}">Réactiver</button><button class="btn sm ghost danger" data-act="remove" data-id="${m.id}">${icon('trash')}</button>`}</td></tr>`; }).join('')}
      </tbody></table></div></div>
      <div class="card card-pad small muted" style="margin-top:16px"><b>Rôles :</b> Admin — tout, y compris les finances (chiffres du mois, encaissements, dépenses, paie des enseignants), les réglages et l'équipe. Employé — élèves, groupes, emploi du temps, encaissement des paiements, relances et liste d'attente, sans vue financière. Enseignant — uniquement ses groupes, son emploi du temps et les présences.</div>`;
  },
  changes: {
    async role(el, app) { await app.save('ctr_members', { role: el.value }, el.dataset.id); toast('Rôle mis à jour.'); await app.refresh('members'); },
    async teacher(el, app) { await app.save('ctr_members', { teacher_id: el.value || null }, el.dataset.id); toast('Fiche enseignant liée.'); await app.refresh('members'); },
  },
  actions: {
    copy: el => copyText(el.dataset.text),
    async regen(el, app) {
      if (!(await confirmBox("Générer un nouveau code ? L'ancien ne fonctionnera plus.", { ok: 'Nouveau code' }))) return;
      app.org.join_code = await app.run(() => app.api.rpc('ctr_regenerate_join_code', { p_org: app.org.id }), 'Nouveau code créé.'); app.render();
    },
    async approve(el, app) {
      const m = app.s.members.find(x => x.id === el.dataset.id);
      if (m.role === 'teacher' && !m.teacher_id) {
        const match = app.s.teachers.find(t => L.normalize(t.full_name) === L.normalize(m.full_name));
        const tid = await modal({ title: 'Lier à une fiche enseignant', body: `<p class="small muted">Un enseignant ne voit que les groupes de sa fiche.</p>${field('Fiche enseignant', select('teacher_id', opts(app.s.teachers, 'full_name'), match?.id || '', { empty: '— Créer une nouvelle fiche —' }))}`,
          submit: 'Approuver', onSubmit: d => d.teacher_id || 'new' });
        if (!tid) return;
        let teacherId = tid;
        if (tid === 'new') teacherId = (await app.save('ctr_teachers', { full_name: m.full_name || m.email, phone: m.phone, email: m.email })).id;
        await app.save('ctr_members', { status: 'active', teacher_id: teacherId }, m.id);
      } else await app.save('ctr_members', { status: 'active' }, m.id);
      toast('Accès approuvé.'); await app.refresh('members', 'teachers');
    },
    async disable(el, app) { if (!(await confirmBox('Désactiver cet accès ?', { ok: 'Désactiver' }))) return; await app.save('ctr_members', { status: 'disabled' }, el.dataset.id); toast('Accès désactivé.'); await app.refresh('members'); },
    async remove(el, app) { if (!(await confirmBox('Retirer ce membre ?', { ok: 'Retirer' }))) return; await app.del('ctr_members', el.dataset.id); toast('Membre retiré.'); await app.refresh('members'); },
  },
};

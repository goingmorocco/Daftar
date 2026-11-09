// Settings, subscription and platform administration.
import { esc, icon, modal, field, input, select, textarea, opts, nullIfEmpty, num, toast, emptyState, confirmBox } from '../ui.js';
import * as L from '../logic.js';
import { pageHead, kpi } from './core.js';

const TABS = [['centre', 'Centre'], ['sites', 'Sites'], ['catalog', 'Niveaux & matières'], ['rooms', 'Salles'], ['prices', 'Prix'], ['messages', 'Messages WhatsApp']];
const VARS = { parent: 'Nom du parent', eleve: "Nom de l'étudiant", groupe: 'Groupe', mois: 'Mois facturé', montant: 'Montant de la facture', reste: 'Reste à payer', date: 'Échéance / date de fin', centre: 'Nom du centre' };

function listEditor(app, table, rows, label, extra = () => '') {
  return `<div class="card"><div class="list">
    ${rows.map(r => `<div class="list-item"><div class="grow"><b>${esc(r.name)}</b> ${extra(r)}</div>
      <button class="btn sm ghost" data-act="rename" data-table="${table}" data-id="${r.id}">${icon('edit')}</button>
      <button class="btn sm ghost danger" data-act="remove" data-table="${table}" data-id="${r.id}">${icon('trash')}</button></div>`).join('') || `<div class="card-pad muted small">Aucun élément.</div>`}
    </div><form data-form="addItem" class="toolbar" style="border-top:1px solid var(--border);border-bottom:0"><input type="hidden" name="table" value="${table}">
      <input name="name" placeholder="${esc(label)}" style="flex:1" required><button class="btn" type="submit">${icon('plus')}Ajouter</button></form></div>`;
}

export const settings = {
  title: 'Réglages',
  allow: app => app.isManager,
  render(app, r) {
    const tab = r.q.tab || 'centre';
    const s = app.settings, o = app.org;
    let body = '';
    if (tab === 'centre') {
      body = `<form data-form="centre" class="card card-pad"><div class="form-grid">
        ${field('Nom du centre', input('name', o.name, { required: true }), 'full')}
        ${field('Ville', input('city', o.city))}${field('Téléphone', input('phone', o.phone, { type: 'tel' }))}
        ${field('Adresse (affichée sur les reçus)', input('address', o.address), 'full')}
        <div class="full" style="border-top:1px solid var(--border);padding-top:12px"><h3>Facturation</h3></div>
        ${field('Délai avant « en retard » (jours)', input('late_grace_days', s.late_grace_days, { type: 'number', min: 0, max: 90 }))}
        ${field('Alerte liste d\'attente (demandes)', input('waitlist_threshold', s.waitlist_threshold, { type: 'number', min: 1, max: 100 }))}
        ${field('Devise', input('currency', s.currency))}
        <label class="check" style="align-self:end"><input type="checkbox" name="auto_invoices"${s.auto_invoices ? ' checked' : ''}> Créer automatiquement chaque échéance (Début + 30 jours, 5 jours à l'avance)</label>
        ${field('Pied de page des reçus', input('receipt_footer', s.receipt_footer), 'full')}
      </div><div style="margin-top:14px"><button class="btn primary" type="submit">Enregistrer</button></div></form>
      <p class="small muted" style="margin-top:10px">Le délai est le nombre de jours qu'un parent a, après l'échéance, pour régler (ou finir un paiement commencé) avant que la facture passe « en retard ».</p>`;
    } else if (tab === 'sites') {
      const lim = L.planLimits(o);
      body = `<p class="small muted" style="margin-bottom:10px">${app.s.centers.filter(c => c.active).length} site(s) actif(s)${lim.centers ? ` — votre plan en inclut ${lim.centers}` : ''}.</p>
        <div class="card"><div class="list">${app.s.centers.map(c => `<div class="list-item"><div class="grow"><b>${esc(c.name)}</b> ${c.active ? '' : '<span class="badge b-cancelled">Archivé</span>'}<div class="cell-sub">${esc([c.address, c.city, c.phone].filter(Boolean).join(' · '))}</div></div>
          <button class="btn sm ghost" data-act="editCenter" data-id="${c.id}">${icon('edit')}</button></div>`).join('')}</div>
          <div class="toolbar" style="border-top:1px solid var(--border);border-bottom:0"><button class="btn" data-act="editCenter">${icon('plus')}Ajouter un site</button></div></div>`;
    } else if (tab === 'catalog') {
      body = `<div class="grid grid-2"><div><h3 style="margin-bottom:8px">Niveaux</h3>${listEditor(app, 'ctr_levels', app.s.levels.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)), 'Ex. 2ème Bac, A1, Débutant…')}</div>
        <div><h3 style="margin-bottom:8px">Matières</h3>${listEditor(app, 'ctr_subjects', app.s.subjects.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)), 'Ex. Mathématiques, Allemand…')}</div></div>`;
    } else if (tab === 'rooms') {
      body = listEditor(app, 'ctr_rooms', app.s.rooms.slice().sort((a, b) => a.name.localeCompare(b.name)), 'Ex. Salle 1', rm => `<span class="cell-sub">${rm.capacity ? rm.capacity + ' places' : ''}${app.s.centers.length > 1 && rm.center_id ? ' · ' + esc(app.name('centers', rm.center_id)) : ''}</span>`);
    } else if (tab === 'prices') {
      const lv = app.s.levels.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)), sb = app.s.subjects.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      body = lv.length && sb.length ? `<form data-form="prices" class="card"><div class="card-head"><div><h2>Un prix par niveau et par matière</h2><div class="small muted">Fixé une fois, il se remplit tout seul à chaque inscription (${esc(app.cur)} / mois).</div></div><button class="btn primary" type="submit">Enregistrer les prix</button></div>
        <div class="table-wrap"><table class="t price-grid"><thead><tr><th>Niveau</th>${sb.map(x => `<th class="r">${esc(x.name)}</th>`).join('')}</tr></thead><tbody>
        ${lv.map(l => `<tr><td class="cell-main">${esc(l.name)}</td>${sb.map(x => { const p = L.priceFor(app.s.prices, l.id, x.id); return `<td class="r"><input name="p_${l.id}_${x.id}" type="number" min="0" step="0.01" value="${p ?? ''}" placeholder="—"></td>`; }).join('')}</tr>`).join('')}
        </tbody></table></div></form>` : emptyState('Ajoutez d\'abord des niveaux et des matières', '', '<a class="btn" href="#/settings?tab=catalog">Niveaux & matières</a>', 'settings');
    } else if (tab === 'messages') {
      const sample = { parent: 'Mme Alaoui', eleve: 'Yassine Alaoui', groupe: 'Maths — 2ème Bac', mois: L.monthLabel(L.today()), montant: '400', reste: '200', date: L.fmtDate(L.addDays(L.today(), 5)), centre: o.name };
      const tpl = (name, title, help) => `<div class="card card-pad"><h3>${title}</h3><p class="small muted">${help}</p>${textarea(name, s[name], 4).replace('<textarea', '<textarea data-input="tpl"')}
        <div class="small" style="margin-top:8px;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px" data-preview="${name}">${esc(L.fillTemplate(s[name], sample))}</div></div>`;
      body = `<form data-form="messages" class="grid">
        ${tpl('tpl_unpaid', 'Impayé', 'Envoyé quand une facture est en retard.')}
        ${tpl('tpl_soon', 'Échéance proche', "Envoyé dans les 3 jours avant la fin du délai.")}
        ${tpl('tpl_renewal', "Fin d'inscription", 'Envoyé quand une inscription se termine dans la semaine.')}
        <div class="card card-pad small"><b>Variables disponibles :</b> ${Object.entries(VARS).map(([k, v]) => `<code>{${k}}</code> ${esc(v)}`).join(' · ')}<br><span class="muted">Écrivez avec vos mots — en français, en arabe ou en darija.</span></div>
        <div><button class="btn primary" type="submit">Enregistrer les messages</button></div></form>`;
    }
    return `${pageHead('Réglages', 'Vos prix, vos messages, vos délais : adaptez l\'application à votre centre.')}
      <div class="tabs">${TABS.map(([k, l]) => `<a href="#/settings?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>${body}`;
  },
  inputs: {
    tpl(el, app) {
      const sample = { parent: 'Mme Alaoui', eleve: 'Yassine Alaoui', groupe: 'Maths — 2ème Bac', mois: L.monthLabel(L.today()), montant: '400', reste: '200', date: L.fmtDate(L.addDays(L.today(), 5)), centre: app.org.name };
      const p = document.querySelector(`[data-preview="${el.name}"]`); if (p) p.textContent = L.fillTemplate(el.value, sample);
    },
  },
  forms: {
    async centre(d, app) {
      await app.run(async () => {
        await app.api.update('ctr_organizations', { id: app.org.id }, { name: d.name, city: nullIfEmpty(d.city), phone: nullIfEmpty(d.phone), address: nullIfEmpty(d.address) });
        await app.api.update('ctr_settings', { org_id: app.org.id }, { late_grace_days: num(d.late_grace_days) ?? 7, waitlist_threshold: num(d.waitlist_threshold) ?? 7,
          currency: d.currency || 'DH', auto_invoices: !!d.auto_invoices, receipt_footer: nullIfEmpty(d.receipt_footer), updated_at: new Date().toISOString() });
      }, 'Réglages enregistrés.');
      Object.assign(app.org, { name: d.name, city: d.city, phone: d.phone, address: d.address });
      await app.refresh('settings');
    },
    async messages(d, app) {
      await app.run(() => app.api.update('ctr_settings', { org_id: app.org.id }, { tpl_unpaid: d.tpl_unpaid, tpl_soon: d.tpl_soon, tpl_renewal: d.tpl_renewal, updated_at: new Date().toISOString() }), 'Messages enregistrés.');
      await app.refresh('settings');
    },
    async addItem(d, app, form) {
      const table = d.table; const key = table.replace('ctr_', '');
      const row = { name: d.name };
      if (table !== 'ctr_rooms') row.sort = (app.s[key] || []).length + 1;
      await app.save(table, row); form.reset(); toast('Ajouté.'); await app.refresh(key);
    },
    async prices(d, app) {
      const ups = [], dels = [];
      for (const [k, v] of Object.entries(d)) {
        if (!k.startsWith('p_')) continue;
        const [, level_id, subject_id] = k.split('_');
        const ex = app.s.prices.find(p => p.level_id === level_id && p.subject_id === subject_id);
        if (v === '') { if (ex) dels.push(ex.id); }
        else if (!ex || Number(ex.monthly_price) !== num(v)) ups.push({ org_id: app.org.id, level_id, subject_id, monthly_price: num(v) });
      }
      await app.run(async () => {
        if (ups.length) await app.api.insert('ctr_prices', ups, { onConflict: 'level_id,subject_id' });
        for (const id of dels) await app.api.remove('ctr_prices', { id });
      }, 'Prix enregistrés.');
      await app.refresh('prices');
    },
  },
  actions: {
    async rename(el, app) {
      const key = el.dataset.table.replace('ctr_', ''); const row = app.s[key].find(x => x.id === el.dataset.id);
      const isRoom = el.dataset.table === 'ctr_rooms';
      await modal({ title: 'Modifier', body: `<div class="form-grid">${field('Nom', input('name', row.name, { required: true }), isRoom ? '' : 'full')}
          ${isRoom ? field('Capacité', input('capacity', row.capacity, { type: 'number', min: 1 })) + (app.s.centers.length > 1 ? field('Site', select('center_id', opts(app.s.centers), row.center_id, { empty: '—' }), 'full') : '') : field('Ordre', input('sort', row.sort, { type: 'number' }))}</div>`,
        onSubmit: async d => {
          const patch = { name: d.name }; if (isRoom) { patch.capacity = num(d.capacity); if (d.center_id !== undefined) patch.center_id = nullIfEmpty(d.center_id); } else patch.sort = num(d.sort) ?? 0;
          await app.save(el.dataset.table, patch, row.id); toast('Modifié.'); await app.refresh(key);
        } });
    },
    async remove(el, app) {
      if (!(await confirmBox('Supprimer cet élément ? Les groupes et étudiants qui l\'utilisent le perdront.', { ok: 'Supprimer' }))) return;
      const key = el.dataset.table.replace('ctr_', '');
      await app.del(el.dataset.table, el.dataset.id); toast('Supprimé.'); await app.refresh(key, 'prices');
    },
    async editCenter(el, app) {
      const c = el.dataset.id ? app.by('centers', el.dataset.id) : null;
      await modal({ title: c ? 'Modifier le site' : 'Nouveau site', body: `<div class="form-grid">${field('Nom', input('name', c?.name, { required: true }), 'full')}${field('Ville', input('city', c?.city))}${field('Téléphone', input('phone', c?.phone))}${field('Adresse', input('address', c?.address), 'full')}
          ${c ? `<label class="check"><input type="checkbox" name="active"${c.active ? ' checked' : ''}> Site actif</label>` : ''}</div>`,
        onSubmit: async d => {
          const row = { name: d.name, city: nullIfEmpty(d.city), phone: nullIfEmpty(d.phone), address: nullIfEmpty(d.address) }; if (c) row.active = !!d.active;
          await app.save('ctr_centers', row, c?.id); toast('Site enregistré.'); await app.refresh('centers');
        } });
    },
  },
};

// ---------------------------------------------------------------- Billing
export const billing = {
  title: 'Abonnement',
  allow: app => app.isManager,
  render(app) {
    const o = app.org, lim = L.planLimits(o), left = L.daysLeft(o);
    const students = app.s.students.filter(s => s.status === 'active').length, centers = app.s.centers.filter(c => c.active).length;
    const wa = app.cfg.SUPPORT_WHATSAPP;
    const ask = plan => wa ? `https://wa.me/${L.normalizePhone(wa)}?text=${encodeURIComponent(`Bonjour, je souhaite activer le plan ${plan} pour « ${o.name} » (${app.user.email}).`)}` : '#';
    const card = (key, desc, feats) => { const p = L.PLANS[key]; return `<div class="plan-card${o.plan === key ? ' current' : ''}"><h3>${p.label}${o.plan === key ? ' <span class="badge b-paid">Actuel</span>' : ''}</h3>
      <div class="price">${p.price ? `${p.price} DH<small class="muted" style="font-size:13px"> / mois</small>` : 'Sur mesure'}</div><p class="small muted">${desc}</p>
      <ul class="small" style="padding-left:18px">${feats.map(f => `<li>${f}</li>`).join('')}</ul>
      <a class="btn ${o.plan === key ? '' : 'primary'}" href="${ask(p.label)}" target="_blank" rel="noopener" style="width:100%">${o.plan === key ? 'Renouveler' : 'Choisir ' + p.label}</a></div>`; };
    return `${pageHead('Abonnement', 'Un abonnement mensuel par centre, sans engagement.')}
      <div class="kpis k4">${kpi('Plan', esc(L.PLANS[o.plan]?.label || o.plan))}
        ${kpi(o.plan === 'trial' ? "Fin de l'essai" : 'Valable jusqu\'au', o.plan_ends_at ? `${L.fmtDate(String(o.plan_ends_at).slice(0, 10))}<small>${left > 0 ? left + ' j' : 'expiré'}</small>` : 'Illimité', left !== null && left <= 3 ? 'bad' : '')}
        ${kpi('Étudiants actifs', `${students}<small>${lim.students ? '/ ' + lim.students : ''}</small>`, lim.students && students >= lim.students ? 'bad' : '')}
        ${kpi('Sites', `${centers}<small>${lim.centers ? '/ ' + lim.centers : ''}</small>`)}</div>
      <div class="plan-cards">
        ${card('starter', 'Pour les centres à site unique qui démarrent.', ["Jusqu'à 150 étudiants, 1 site", 'Toutes les fonctionnalités', 'Relances WhatsApp', 'Paie des enseignants et dépenses'])}
        ${card('growth', 'Pour les centres en croissance, plusieurs groupes et équipes.', ["Jusqu'à 500 étudiants, 3 sites", 'Tout Starter', 'Plusieurs sites sur un compte', 'Support prioritaire'])}
        ${card('enterprise', 'Pour les réseaux et franchises.', ['Étudiants et sites sur mesure', 'Tout Growth', 'Accompagnement dédié', 'Contrat sur mesure'])}</div>
      <p class="small muted" style="margin-top:14px">Paiement par virement ou en espèces. L'activation est faite par notre équipe dès réception — vos données sont conservées, même après la fin de l'essai.</p>`;
  },
};

// ---------------------------------------------------------------- Platform admin
export const admin = {
  title: 'Plateforme',
  allow: app => app.platformAdmin,
  render(app) {
    const rows = app.viewState.orgs;
    if (!rows) return `${pageHead('Plateforme', 'Tous les centres abonnés.')}<div class="card card-pad muted">Chargement…</div>`;
    const active = rows.filter(o => L.planActive(o));
    const mrr = active.reduce((s, o) => s + (L.PLANS[o.plan]?.price || 0), 0);
    return `${pageHead('Plateforme', 'Tous les centres, leurs plans et leur utilisation.', `<button class="btn" data-act="reload">${icon('refresh')}Actualiser</button>`)}
      <div class="kpis k4">${kpi('Centres', String(rows.length))}${kpi('Actifs', String(active.length), 'ok')}${kpi('En essai', String(rows.filter(o => o.plan === 'trial' && L.planActive(o)).length))}${kpi('Revenu mensuel', `${mrr}<small>DH</small>`)}</div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Centre</th><th>Plan</th><th>Fin</th><th class="r">Étudiants</th><th class="r">Sites</th><th></th></tr></thead><tbody>
        ${rows.map(o => `<tr><td><div class="cell-main">${esc(o.name)}</div><div class="cell-sub">${esc([o.city, o.owner_email, o.phone].filter(Boolean).join(' · '))}</div></td>
          <td>${esc(L.PLANS[o.plan]?.label || o.plan)}</td><td class="nowrap">${o.plan_ends_at ? `${L.fmtDate(String(o.plan_ends_at).slice(0, 10))} ${L.planActive(o) ? '' : '<span class="badge b-overdue">Expiré</span>'}` : '—'}</td>
          <td class="r num">${o.students}${o.max_students ? ' / ' + o.max_students : ''}</td><td class="r num">${o.centers}</td>
          <td class="r"><button class="btn sm" data-act="editOrg" data-id="${o.id}">${icon('edit')}Gérer</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  },
  async after(app) {
    if (app.viewState.orgs) return;
    app.viewState.orgs = await app.api.rpc('ctr_admin_list_orgs').catch(e => { toast(L.friendlyError(e), 'err'); return []; });
    app.render();
  },
  actions: {
    reload(el, app) { app.viewState.orgs = null; app.render(); },
    async editOrg(el, app) {
      const o = app.viewState.orgs.find(x => x.id === el.dataset.id);
      await modal({ title: o.name, body: `<div class="form-grid">
          ${field('Plan', select('plan', Object.entries(L.PLANS).map(([value, p]) => ({ value, label: p.label })), o.plan))}
          ${field('Valable jusqu\'au (vide = illimité)', input('plan_ends_at', o.plan_ends_at ? String(o.plan_ends_at).slice(0, 10) : '', { type: 'date' }))}
          ${field('Limite étudiants (vide = selon plan)', input('max_students', o.max_students, { type: 'number', min: 1 }))}
          ${field('Limite sites (vide = selon plan)', input('max_centers', o.max_centers, { type: 'number', min: 1 }))}
          <div class="full actions"><button type="button" class="btn sm" data-plus="1">+1 mois</button><button type="button" class="btn sm" data-plus="12">+1 an</button></div></div>`,
        onOpen(ov) {
          ov.querySelectorAll('[data-plus]').forEach(b => b.addEventListener('click', () => {
            const i = ov.querySelector('[name=plan_ends_at]'); const base = i.value && i.value > L.today() ? i.value : L.today();
            const d = L.parse(base); d.setMonth(d.getMonth() + Number(b.dataset.plus)); i.value = L.iso(d);
          }));
        },
        onSubmit: async d => {
          await app.run(() => app.api.update('ctr_organizations', { id: o.id }, { plan: d.plan, plan_ends_at: d.plan_ends_at ? d.plan_ends_at + 'T23:59:59Z' : null,
            max_students: num(d.max_students), max_centers: num(d.max_centers) }), 'Centre mis à jour.');
          app.viewState.orgs = null; app.render();
        } });
    },
  },
};

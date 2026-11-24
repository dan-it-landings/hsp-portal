/* Портал збору даних про чисельність і заробітну плату (HSP). Без бібліотек. */
(() => {
  'use strict';
  const CFG = window.HSP_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d = 0) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('uk-UA', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return mem[k] || null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { delete mem[k]; } },
  };
  const mem = {};
  let FIELDS = null; let FLAT = [];
  let state = { token: store.get('hsp_token'), code: store.get('hsp_code'), role: store.get('hsp_role') };

  $('#groupName').textContent = CFG.GROUP_NAME || '';
  if (CFG.DEMO) document.body.insertAdjacentHTML('afterbegin', '<div class="demo-flag">Демо-режим: тестові дані, нічого не надсилається. Пароль для входу — <b>123456</b>, адміністратор — код <b>ADMIN</b>.</div>');

  function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 5000); }
  function modal(title, html) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; $('#modal').showModal(); return $('#modalBody'); }
  $('#modalClose').onclick = () => $('#modal').close();
  $('#logoutBtn').onclick = () => logout();

  async function api(action, payload = {}) {
    const body = { action, token: state.token, code: state.code, ...payload };
    let res;
    try {
      if (CFG.DEMO) res = await window.HSP_DEMO_API(body);
      else {
        const r = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const txt = await r.text();
        res = txt ? JSON.parse(txt) : { ok: r.ok };
        if (!r.ok && res.ok === undefined) res.ok = false;
      }
    } catch (e) {
      return { ok: false, error: 'Немає зв’язку з сервером. Перевірте інтернет і спробуйте ще раз.' };
    }
    if (res && res.relogin) { logout(true); toast(res.error || 'Сесія завершилась.', true); }
    return res || { ok: false, error: 'Порожня відповідь сервера.' };
  }

  function logout(silent) {
    state = { token: null, code: state.code, role: null };
    store.del('hsp_token'); store.del('hsp_role');
    renderLogin();
  }

  function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn._t = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span> Зачекайте…'; } else if (btn._t) btn.innerHTML = btn._t; }

  // ---------------- Вхід ----------------
  function renderLogin(msg) {
    $('#who').hidden = true;
    const qc = new URLSearchParams(location.search).get('c') || state.code || '';
    app.innerHTML = `
      <div class="card narrow">
        <h1>Вхід на портал</h1>
        <p class="muted small">Код організації та одноразовий пароль надходять листом разом із запитом на подання даних.</p>
        ${msg ? `<div class="banner info small">${esc(msg)}</div>` : ''}
        <form id="loginForm" class="stack" autocomplete="off">
          <div><label for="lc">Код організації</label><input id="lc" required value="${esc(qc)}" autocapitalize="characters" spellcheck="false"></div>
          <div><label for="lp">Одноразовий пароль</label><input id="lp" required inputmode="text" autocomplete="one-time-code" spellcheck="false"></div>
          <button class="btn" type="submit" style="width:100%">Увійти</button>
        </form>
        <p class="small" style="margin-top:16px">Пароль не надходив, втрачено або минув строк дії? <button class="link" id="needCode">Отримати новий пароль</button></p>
      </div>`;
    $('#lp').focus();
    if (!qc) $('#lc').focus();
    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.submitter; busy(btn, true);
      state.code = $('#lc').value.trim().toUpperCase();
      const r = await api('login', { code: state.code, otp: $('#lp').value.trim() });
      busy(btn, false);
      if (!r.ok) return toast(r.error || 'Не вдалося увійти.', true);
      state.token = r.token; state.role = r.role;
      store.set('hsp_token', r.token); store.set('hsp_code', state.code); store.set('hsp_role', r.role);
      history.replaceState(null, '', location.pathname);
      route();
    };
    $('#needCode').onclick = () => renderRequestCode($('#lc').value.trim());
  }

  function renderRequestCode(code) {
    app.innerHTML = `
      <div class="card narrow">
        <h1>Новий одноразовий пароль</h1>
        <p class="muted small">Вкажіть код організації та свій робочий email, зареєстрований як відповідальний. Пароль надійде на пошту протягом хвилини і діятиме 30 хвилин.</p>
        <form id="rcForm" class="stack">
          <div><label for="rc">Код організації</label><input id="rc" required value="${esc(code || '')}"></div>
          <div><label for="re">Робочий email</label><input id="re" type="email" required></div>
          <button class="btn" type="submit" style="width:100%">Надіслати пароль</button>
        </form>
        <p class="small" style="margin-top:16px"><button class="link" id="back">← Повернутися до входу</button></p>
      </div>`;
    $('#back').onclick = () => renderLogin();
    $('#rcForm').onsubmit = async (e) => {
      e.preventDefault(); const btn = e.submitter; busy(btn, true);
      state.code = $('#rc').value.trim().toUpperCase();
      const r = await api('request_code', { code: state.code, email: $('#re').value.trim() });
      busy(btn, false);
      renderLogin(r.message || r.error || 'Запит надіслано.');
    };
  }

  // ---------------- Маршрут ----------------
  async function route() {
    if (!state.token) return renderLogin();
    app.innerHTML = '<div class="empty"><span class="spinner"></span> Завантаження…</div>';
    const r = await api('me');
    if (!r.ok) { if (!r.relogin) { app.innerHTML = `<div class="banner bad">${esc(r.error)}</div>`; } return; }
    $('#who').hidden = false;
    $('#whoText').textContent = `${r.user.full_name || ''} · ${r.user.email}`;
    if (r.role === 'admin') return renderAdmin();
    renderRespondent(r);
  }

  // ---------------- Відповідальний ----------------
  function statusBanner(me) {
    const cur = me.history.find((h) => h.period === me.current_period);
    const ed = me.editable.find((e) => e.period === me.current_period);
    if (cur && !ed) return `<div class="banner ok">Дані за <b>${esc(me.current_period_label)}</b> подано ${esc(cur.entered_at)} (${esc(cur.entered_by)}). Дякуємо!</div>`;
    if (ed && !cur) return `<div class="banner warn">Очікуємо дані за <b>${esc(me.current_period_label)}</b> до <b>${esc(me.deadline)}</b>. Форма нижче.</div>`;
    return '';
  }

  function renderRespondent(me) {
    const open = me.questions.filter((q) => q.status === 'open');
    app.innerHTML = `
      <div class="row" style="margin-bottom:14px"><div class="grow"><h1>${esc(me.company.name)}</h1><div class="muted small">Код ${esc(me.company.code)} · ${esc(me.company.segment)} ${me.company.region ? '· ' + esc(me.company.region) : ''} · відповідальні: ${me.responsibles.map((r) => esc(r.full_name || r.email)).join(', ')}</div></div></div>
      ${statusBanner(me)}
      ${me.questions.length ? `<div class="card"><h2>Питання щодо даних ${open.length ? `<span class="badge bad">${open.length} без відповіді</span>` : ''}</h2><div id="qList"></div></div>` : ''}
      <div id="formHost"></div>
      <div class="card"><h2>Подані дані</h2><div id="histHost"></div></div>
      ${me.corrections.length ? `<div class="card"><h2>Запити на виправлення</h2><div id="corrHost"></div></div>` : ''}`;
    if (me.questions.length) renderQuestions(me);
    renderForms(me);
    renderHistory(me);
    if (me.corrections.length) renderCorrections(me);
  }

  function renderQuestions(me) {
    const host = $('#qList');
    host.innerHTML = me.questions.map((q) => `
      <div class="q ${q.status === 'answered' ? 'answered' : q.severity === 'high' ? 'high' : ''}">
        <div class="row"><b class="grow">${esc(q.period_label)}</b>${q.status === 'answered' ? '<span class="badge ok">відповідь надіслано, перевіряється</span>' : '<span class="badge warn">потрібна відповідь</span>'}</div>
        <div style="margin:6px 0">${esc(q.text)}</div>
        ${q.answer_text ? `<div class="small muted">${esc(q.answer_text)}</div>` : ''}
        ${q.status === 'open' ? `<div class="row small" style="margin-top:8px"><span class="muted">Дані помилкові — виправте їх у формі нижче. Дані правильні —</span><button class="btn line sm" data-ans="${esc(q.question_id)}">напишіть пояснення</button></div>` : ''}
      </div>`).join('');
    host.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = () => {
      const q = me.questions.find((x) => x.question_id === b.dataset.ans);
      const body = modal('Пояснення до питання', `<p>${esc(q.text)}</p><label for="ansT">Пояснення (чому дані правильні)</label><textarea id="ansT"></textarea><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="ansSend">Надіслати</button></div>`);
      $('#ansSend', body).onclick = async (e) => {
        busy(e.target, true);
        const r = await api('answer_question', { question_id: q.question_id, answer: $('#ansT', body).value });
        busy(e.target, false);
        if (!r.ok) return toast(r.error, true);
        $('#modal').close(); toast(r.message); route();
      };
    }));
  }

  function prevData(me, period) {
    const ps = me.history.map((h) => h.period).filter((p) => p < period).sort();
    const h = me.history.find((x) => x.period === ps[ps.length - 1]);
    return h ? h.data : null;
  }

  function renderForms(me) {
    const host = $('#formHost');
    if (!me.editable.length) { host.innerHTML = ''; return; }
    let active = me.editable[0].period;
    const draw = () => {
      const ed = me.editable.find((e) => e.period === active);
      const prev = prevData(me, active);
      const vals = ed.prefill || {};
      host.innerHTML = `<div class="card">
        <h2>Внесення даних</h2>
        ${me.editable.length > 1 ? `<div class="tabs">${me.editable.map((e) => `<button class="tab ${e.period === active ? 'on' : ''}" data-p="${e.period}">${esc(e.label)}</button>`).join('')}</div>` : ''}
        <div class="banner info small"><b>${esc(ed.label)}</b> · ${esc(ed.reason)}${ed.prefill ? ' · форма заповнена поточною версією, змініть потрібні поля' : ''}. Обов’язкові поля позначено <span class="req" style="color:var(--bad)">*</span>. Праворуч — значення попереднього місяця.</div>
        <form id="dataForm" novalidate>
          ${FIELDS.sections.map((s) => {
            let lastGroup = null;
            return `<fieldset><legend>${esc(s.title)}</legend>${s.fields.map((f) => {
              const g = f.group && f.group !== lastGroup ? `<div class="small muted" style="margin:8px 0 2px">${esc(f.group)}</div>` : '';
              lastGroup = f.group || null;
              const sub = f.group || /^з них/.test(f.label) || /^фонд /.test(f.label);
              return `${g}<div class="frow ${sub ? 'sub' : ''}" data-k="${f.key}"><div class="lbl">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}${f.hint ? `<div class="small muted">${esc(f.hint)}</div>` : ''}</div>
                <input name="${f.key}" inputmode="decimal" value="${vals[f.key] ?? ''}" aria-label="${esc(f.label)}"><div class="prev">${prev && prev[f.key] !== undefined && prev[f.key] !== null ? 'мин. міс.: ' + nf(prev[f.key], f.type === 'int' ? 0 : f.type === 'money' ? 2 : 1) : ''} ${esc(f.unit)}</div></div>`;
            }).join('')}<div class="checks" data-sec="${s.id}"></div></fieldset>`;
          }).join('')}
          <div><label for="cmt">${esc(FIELDS.comment.label)}</label><textarea id="cmt" name="comment">${esc(vals.comment || '')}</textarea></div>
          <div class="row" style="margin-top:14px;justify-content:flex-end"><span class="muted small grow">Після подання змінити дані можна лише за погодженням адміністратора.</span><button class="btn" type="submit">Подати дані за ${esc(ed.label)}</button></div>
        </form></div>`;
      host.querySelectorAll('.tab').forEach((t) => (t.onclick = () => { active = t.dataset.p; draw(); }));
      const form = $('#dataForm');
      form.oninput = () => liveChecks(form, prev);
      liveChecks(form, prev);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const data = {}; FLAT.forEach((f) => { data[f.key] = form.elements[f.key].value.trim(); });
        const errs = localErrors(data);
        form.querySelectorAll('.frow').forEach((r) => r.classList.toggle('err', errs.keys.includes(r.dataset.k)));
        if (errs.list.length) return toast(errs.list[0], true);
        if (!confirm(`Подати дані за ${ed.label}? Після подання змінити їх можна буде лише за погодженням.`)) return;
        const btn = e.submitter; busy(btn, true);
        const r = await api('submit', { period: active, data, comment: form.elements.comment.value });
        busy(btn, false);
        if (!r.ok) { toast(r.error || 'Помилка', true); if (r.errors) modal('Дані не прийнято', `<ul>${r.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`); return; }
        toast(r.message); route();
      };
    };
    draw();
  }

  const val = (form, k) => { const v = form.elements[k].value.replace(/\s/g, '').replace(',', '.'); return v === '' ? null : Number(v); };

  function localErrors(data) {
    const list = []; const keys = [];
    FLAT.forEach((f) => {
      const raw = String(data[f.key] ?? '').replace(/\s/g, '').replace(',', '.');
      if (raw === '') { if (f.required) { list.push(`Не заповнено: ${f.label}`); keys.push(f.key); } return; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || (f.type === 'int' && !Number.isInteger(n))) { list.push(`Некоректне значення: ${f.label}`); keys.push(f.key); }
    });
    return { list, keys };
  }

  function liveChecks(form, prev) {
    const v = (k) => val(form, k) || 0;
    const set = (sec, html) => { const el = form.querySelector(`.checks[data-sec="${sec}"]`); if (el) el.innerHTML = html; };
    const c = (cls, t) => `<div class="check ${cls}">${t}</div>`;
    const catSum = v('cat_managers') + v('cat_professionals') + v('cat_clerks') + v('cat_workers');
    let a = '';
    if (val(form, 'hc_end') !== null) {
      a += catSum === v('hc_end') ? c('ok', `Сума за категоріями: ${nf(catSum)} — збігається з обліковою кількістю.`) : c('bad', `Сума за категоріями ${nf(catSum)} ≠ облікова кількість ${nf(v('hc_end'))}.`);
      if (prev && prev.hc_end) {
        const ch = v('hc_end') / prev.hc_end - 1;
        if (Math.abs(ch) > 0.1 && Math.abs(v('hc_end') - prev.hc_end) >= 3) a += c('warn', `Чисельність змінилась на ${(ch * 100).toFixed(1)}% до минулого місяця — додайте пояснення в коментарі.`);
        const bal = prev.hc_end + v('hired') - v('fired');
        if (val(form, 'hired') !== null && val(form, 'fired') !== null && bal !== v('hc_end')) a += c('warn', `Рух персоналу: ${nf(prev.hc_end)} + ${nf(v('hired'))} − ${nf(v('fired'))} = ${nf(bal)}, а на кінець місяця ${nf(v('hc_end'))}. Перевірте прийнятих і звільнених.`);
      }
    }
    set('A', a);
    let d = '';
    if (val(form, 'fop_total') !== null) {
      const parts = v('fop_base') + v('fop_extra') + v('fop_other');
      d += Math.abs(parts - v('fop_total')) <= 1 ? c('ok', 'Структура ФОП збігається з ФОП всього.') : c('bad', `Складові ФОП: ${nf(parts, 2)} ≠ ФОП всього ${nf(v('fop_total'), 2)}.`);
      const base = v('fop_total') + v('fop_gph');
      if (val(form, 'esv') !== null && base) { const r = v('esv') / base; if (r < 0.12 || r > 0.225) d += c('warn', `ЄСВ становить ${(r * 100).toFixed(1)}% від ФОП і ЦПХ (очікується близько 22%).`); }
    }
    set('D', d);
    let e = '';
    if (val(form, 'fop_total') !== null && v('hc_avg')) {
      const calc = v('fop_total') / v('hc_avg');
      e += c('ok', `Розрахунок: ФОП ÷ середньооблікова = <b>${nf(calc)}</b> грн.`);
      if (val(form, 'avg_salary') !== null && Math.abs(v('avg_salary') / calc - 1) > 0.03) e += c('bad', `Заявлена середня ${nf(v('avg_salary'))} грн відрізняється від розрахунку більш ніж на 3%.`);
      if (prev && prev.avg_salary && val(form, 'avg_salary') !== null) { const ch = v('avg_salary') / prev.avg_salary - 1; if (ch > 0.2 || ch < -0.15) e += c('warn', `Середня зарплата змінилась на ${(ch * 100).toFixed(1)}% — поясніть причину в коментарі.`); }
    }
    if (v('arrears') > 0) e += c('warn', 'Вказано заборгованість із зарплати — опишіть причину і строк погашення в коментарі.');
    set('E', e);
  }

  function renderHistory(me) {
    const host = $('#histHost');
    if (!me.history.length) { host.innerHTML = '<div class="empty">Даних ще немає.</div>'; return; }
    const pending = new Set(me.corrections.filter((c) => c.status === 'pending' || c.status === 'approved').map((c) => c.period));
    host.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Період</th><th class="num">Облікова к-сть</th><th class="num">Середньооблік.</th><th class="num">ФОП, грн</th><th class="num">Сер. зарплата, грн</th><th>Вніс</th><th>Дата</th><th>Версія</th><th></th></tr></thead><tbody>
      ${me.history.map((h) => `<tr><td class="nowrap">${esc(h.label)}${h.late ? ' <span class="badge warn">із запізненням</span>' : ''}</td><td class="num">${nf(h.data.hc_end)}</td><td class="num">${nf(h.data.hc_avg, 1)}</td><td class="num">${nf(h.data.fop_total)}</td><td class="num">${nf(h.data.avg_salary)}</td>
        <td>${esc(h.entered_by)}</td><td class="nowrap">${esc(h.entered_at)}</td><td>${h.version}</td>
        <td class="nowrap"><button class="btn ghost sm" data-det="${h.period}">Детально</button>${pending.has(h.period) ? '' : ` <button class="btn line sm" data-corr="${h.period}">Виправити</button>`}</td></tr>`).join('')}
      </tbody></table></div>`;
    host.querySelectorAll('[data-det]').forEach((b) => (b.onclick = () => showDetail(me.history.find((h) => h.period === b.dataset.det))));
    host.querySelectorAll('[data-corr]').forEach((b) => (b.onclick = () => {
      const h = me.history.find((x) => x.period === b.dataset.corr);
      const body = modal(`Запит на виправлення: ${h.label}`, `<p class="small muted">Подані дані змінюються лише за погодженням адміністратора. Після погодження форма за цей період відкриється, і ви отримаєте лист.</p><label for="crR">Що і чому потрібно виправити</label><textarea id="crR"></textarea><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="crSend">Надіслати запит</button></div>`);
      $('#crSend', body).onclick = async (e) => {
        busy(e.target, true);
        const r = await api('correction_request', { period: h.period, reason: $('#crR', body).value });
        busy(e.target, false);
        if (!r.ok) return toast(r.error, true);
        $('#modal').close(); toast(r.message); route();
      };
    }));
  }

  function showDetail(h, title) {
    const html = FIELDS.sections.map((s) => `<h3 style="margin:14px 0 6px">${esc(s.title)}</h3><div class="kv">${s.fields.map((f) => `<div>${esc(f.label)}, ${esc(f.unit)}</div><div>${nf(h.data[f.key], f.type === 'int' ? 0 : f.type === 'money' ? 2 : 1)}</div>`).join('')}</div>`).join('') +
      (h.data.comment ? `<h3 style="margin:14px 0 6px">Коментар</h3><p>${esc(h.data.comment)}</p>` : '') +
      `<h3 style="margin:14px 0 6px">Версії</h3><table><thead><tr><th>Версія</th><th>Вніс</th><th>Дата</th><th>Підстава</th></tr></thead><tbody>${h.versions.map((v) => `<tr><td>${v.version}</td><td>${esc(v.entered_by)}</td><td>${esc(v.entered_at)}</td><td>${esc(REASON[v.reason] || v.reason)}</td></tr>`).join('')}</tbody></table>`;
    modal(title || `Дані за ${h.label}`, html);
  }
  const REASON = { initial: 'первинне подання', correction: 'виправлення за погодженням', clarification: 'уточнення за питаннями', resubmit: 'повторне', import: 'імпорт історії' };
  const CST = { pending: ['очікує рішення', 'warn'], approved: ['погоджено — внесіть зміни', 'info'], rejected: ['відхилено', 'bad'], done: ['виконано', 'ok'] };

  function renderCorrections(me) {
    $('#corrHost').innerHTML = `<table><thead><tr><th>Період</th><th>Причина</th><th>Ініціатор</th><th>Дата</th><th>Статус</th><th>Коментар</th></tr></thead><tbody>${me.corrections.map((c) => `<tr><td class="nowrap">${esc(c.period_label)}</td><td>${esc(c.reason)}</td><td>${esc(c.requested_by)}</td><td class="nowrap">${esc(c.requested_at)}</td><td><span class="badge ${CST[c.status][1]}">${CST[c.status][0]}</span></td><td>${esc(c.decision_comment)}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---------------- Адміністратор ----------------
  let adm = { period: null, data: null, sort: 'code', dir: 1, f: { q: '', seg: '', st: '', flag: '' } };

  async function renderAdmin() {
    app.innerHTML = '<div class="empty"><span class="spinner"></span> Завантаження дашборду…</div>';
    const r = await api('admin_dashboard', { period: adm.period });
    if (!r.ok) { app.innerHTML = `<div class="banner bad">${esc(r.error)}</div>`; return; }
    adm.data = r; adm.period = r.period;
    const s = r.summary; const pctv = s.total ? Math.round((s.submitted / s.total) * 100) : 0;
    const maxT = Math.max(1, ...r.timeline.map((t) => t.count));
    app.innerHTML = `
      <div class="row" style="margin-bottom:14px"><div class="grow"><h1>Дашборд подання даних</h1><div class="muted small">Строк подання за ${esc(r.period_label)} — до ${esc(r.deadline)}${r.deadline_passed ? ' (минув)' : ''}</div></div>
        <div><label for="perSel">Звітний період</label><select id="perSel">${r.periods.map((p) => `<option value="${p.period}" ${p.period === r.period ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
        <button class="btn line" id="refresh" style="align-self:flex-end">Оновити</button></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${s.submitted} / ${s.total}</div><div class="l">подали дані (${pctv}%)</div><div class="progress" style="margin-top:8px"><span style="width:${pctv}%"></span></div></div>
        <div class="kpi ${s.missing ? 'bad' : 'ok'}"><div class="v">${s.missing}</div><div class="l">не подали</div></div>
        <div class="kpi ${s.late ? 'warn' : ''}"><div class="v">${s.late}</div><div class="l">із запізненням або прострочено</div></div>
        <div class="kpi ${s.open_q ? 'warn' : ''}"><div class="v">${s.open_q}</div><div class="l">питань без відповіді</div></div>
        <div class="kpi"><div class="v">${s.answered_q}</div><div class="l">відповідей на перевірці</div></div>
        <div class="kpi ${s.pending_corr ? 'warn' : ''}"><div class="v">${s.pending_corr}</div><div class="l">запитів на виправлення</div></div>
        <div class="kpi"><div class="v">${nf(s.hc_end_total)}</div><div class="l">облікова кількість (подані)</div></div>
        <div class="kpi"><div class="v">${nf(s.avg_salary_group)}</div><div class="l">середня зарплата групи, грн</div></div>
      </div>
      ${r.pending.length ? `<div class="card"><h2>Запити на виправлення <span class="badge warn">${r.pending.length}</span></h2><table><thead><tr><th>Компанія</th><th>Період</th><th>Причина</th><th>Ініціатор</th><th>Дата</th><th></th></tr></thead><tbody>${r.pending.map((p) => `<tr><td>${esc(p.name)} <span class="muted small">${esc(p.code)}</span></td><td class="nowrap">${esc(p.period_label)}</td><td>${esc(p.reason)}</td><td>${esc(p.requested_by)}</td><td class="nowrap">${esc(p.requested_at)}</td><td class="nowrap"><button class="btn sm" data-dec="approve" data-id="${esc(p.correction_id)}">Погодити</button> <button class="btn danger sm" data-dec="reject" data-id="${esc(p.correction_id)}">Відхилити</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="grid2">
        <div class="card"><h2>Подання за сегментами</h2>${r.segments.map((g) => `<div class="seg-row"><div>${esc(g.segment)}</div><div class="progress"><span style="width:${g.total ? (g.submitted / g.total) * 100 : 0}%"></span></div><div class="small num">${g.submitted} / ${g.total}</div></div>`).join('')}</div>
        <div class="card"><h2>Подання за днями</h2>${r.timeline.length ? `<div class="bars">${r.timeline.map((t) => `<div class="b" style="height:${(t.count / maxT) * 100}%" title="${esc(t.date)}: ${t.count}"><span>${t.count}</span></div>`).join('')}</div><div class="bars-x">${r.timeline.map((t) => `<div>${esc(t.date.slice(0, 5))}</div>`).join('')}</div>` : '<div class="empty">Подань ще немає.</div>'}</div>
      </div>
      <div class="card"><div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">Компанії</h2><button class="btn line sm" id="csv">Завантажити CSV</button></div>
        <div class="filters">
          <input id="fq" placeholder="Пошук: назва, код, email" value="${esc(adm.f.q)}">
          <select id="fseg"><option value="">Усі сегменти</option>${r.segments.map((g) => `<option ${adm.f.seg === g.segment ? 'selected' : ''}>${esc(g.segment)}</option>`).join('')}</select>
          <select id="fst"><option value="">Усі статуси</option><option value="submitted" ${adm.f.st === 'submitted' ? 'selected' : ''}>Подали</option><option value="missing" ${adm.f.st === 'missing' ? 'selected' : ''}>Не подали</option></select>
          <select id="fflag"><option value="">Без додаткового фільтра</option><option value="late" ${adm.f.flag === 'late' ? 'selected' : ''}>Із запізненням</option><option value="q" ${adm.f.flag === 'q' ? 'selected' : ''}>Є відкриті питання</option><option value="corr" ${adm.f.flag === 'corr' ? 'selected' : ''}>Є запит на виправлення</option><option value="v2" ${adm.f.flag === 'v2' ? 'selected' : ''}>Дані змінювались</option></select>
          <span class="muted small" id="cnt" style="align-self:center"></span>
        </div>
        <div class="table-wrap" id="tblHost"></div></div>`;
    $('#perSel').onchange = (e) => { adm.period = e.target.value; renderAdmin(); };
    $('#refresh').onclick = () => renderAdmin();
    ['fq', 'fseg', 'fst', 'fflag'].forEach((id) => ($('#' + id).oninput = () => { adm.f = { q: $('#fq').value, seg: $('#fseg').value, st: $('#fst').value, flag: $('#fflag').value }; drawTable(); }));
    app.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => decide(b.dataset.id, b.dataset.dec)));
    $('#csv').onclick = exportCsv;
    drawTable();
  }

  function filtered() {
    const f = adm.f; const q = f.q.trim().toLowerCase();
    return adm.data.companies.filter((c) => (!q || [c.name, c.code, c.entered_by, ...(c.responsibles || [])].join(' ').toLowerCase().includes(q)) &&
      (!f.seg || c.segment === f.seg) && (!f.st || c.status === f.st) &&
      (!f.flag || (f.flag === 'late' && c.late) || (f.flag === 'q' && c.open_q) || (f.flag === 'corr' && c.pending_corr) || (f.flag === 'v2' && c.version > 1)))
      .sort((a, b) => { const x = a[adm.sort] ?? ''; const y = b[adm.sort] ?? ''; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'uk')) * adm.dir; });
  }

  function drawTable() {
    const list = filtered();
    $('#cnt').textContent = `${list.length} з ${adm.data.companies.length}`;
    const cols = [['code', 'Код'], ['name', 'Компанія'], ['segment', 'Сегмент'], ['status', 'Статус'], ['entered_by', 'Хто вніс'], ['entered_at', 'Коли'], ['version', 'Версія', 1], ['hc_end', 'Облік. к-сть', 1], ['avg_salary', 'Сер. ЗП', 1], ['open_q', 'Питання', 1]];
    $('#tblHost').innerHTML = `<table><thead><tr>${cols.map(([k, l, n]) => `<th class="sortable ${n ? 'num' : ''}" data-s="${k}">${l}${adm.sort === k ? (adm.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
      ${list.map((c) => `<tr class="clickable" data-c="${esc(c.code)}"><td>${esc(c.code)}</td><td>${esc(c.name)}</td><td>${esc(c.segment)}</td>
        <td>${c.status === 'submitted' ? `<span class="badge ok">подано</span>${c.late ? ' <span class="badge warn">із запізн.</span>' : ''}` : `<span class="badge bad">не подано</span>${c.late ? ' <span class="badge bad">прострочено</span>' : ''}`}${c.pending_corr ? ' <span class="badge info">запит</span>' : ''}</td>
        <td>${esc(c.entered_by)}</td><td class="nowrap">${esc(c.entered_at)}</td><td class="num">${c.version || ''}</td><td class="num">${nf(c.hc_end)}</td><td class="num">${nf(c.avg_salary)}</td>
        <td class="num">${c.open_q ? `<span class="badge warn">${c.open_q}</span>` : ''}${c.answered_q ? ` <span class="badge ok" title="відповіді на перевірці">${c.answered_q}</span>` : ''}</td></tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">Нічого не знайдено</td></tr>`}</tbody></table>`;
    $('#tblHost').querySelectorAll('th[data-s]').forEach((th) => (th.onclick = () => { adm.dir = adm.sort === th.dataset.s ? -adm.dir : 1; adm.sort = th.dataset.s; drawTable(); }));
    $('#tblHost').querySelectorAll('tr[data-c]').forEach((tr) => (tr.onclick = () => companyCard(tr.dataset.c)));
  }

  async function companyCard(code) {
    const body = modal('Компанія ' + code, '<div class="empty"><span class="spinner"></span></div>');
    const r = await api('admin_company', { company_code: code });
    if (!r.ok) { body.innerHTML = `<div class="banner bad">${esc(r.error)}</div>`; return; }
    const row = adm.data.companies.find((c) => c.code === code) || {};
    $('#modalTitle').textContent = r.company.name;
    body.innerHTML = `<div class="muted small" style="margin-bottom:10px">Код ${esc(code)} · ${esc(r.company.segment)} · ЄДРПОУ ${esc(r.company.edrpou)} · керівник: ${esc(row.manager_email || '—')}<br>Відповідальні: ${r.responsibles.map((x) => esc(`${x.full_name} <${x.email}>`)).join(', ')}</div>
      ${r.questions.length ? `<h3 style="margin:10px 0 6px">Питання</h3>${r.questions.map((q) => `<div class="q ${q.status === 'answered' ? 'answered' : ''}"><b>${esc(q.period_label)}</b> · ${q.status === 'open' ? 'без відповіді' : 'відповідь отримано'}<div>${esc(q.text)}</div>${q.answer_text ? `<div class="small muted">${esc(q.answer_text)}</div>` : ''}</div>`).join('')}` : ''}
      <h3 style="margin:14px 0 6px">Подання за періодами</h3>
      ${r.history.length ? `<table><thead><tr><th>Період</th><th class="num">Облік.</th><th class="num">Сер. облік.</th><th class="num">ФОП</th><th class="num">Сер. ЗП</th><th>Хто вніс</th><th>Коли</th><th>Версій</th><th></th></tr></thead><tbody>${r.history.map((h) => `<tr><td class="nowrap">${esc(h.label)}${h.late ? ' <span class="badge warn">запізн.</span>' : ''}</td><td class="num">${nf(h.data.hc_end)}</td><td class="num">${nf(h.data.hc_avg, 1)}</td><td class="num">${nf(h.data.fop_total)}</td><td class="num">${nf(h.data.avg_salary)}</td><td>${esc(h.entered_by)}</td><td class="nowrap">${esc(h.entered_at)}</td><td>${h.versions.length}</td><td><button class="btn ghost sm" data-hd="${h.period}">Усі поля</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Подань немає.</div>'}
      ${r.corrections.length ? `<h3 style="margin:14px 0 6px">Запити на виправлення</h3><table><tbody>${r.corrections.map((c) => `<tr><td>${esc(c.period_label)}</td><td>${esc(c.reason)}</td><td>${esc(c.requested_by)}</td><td><span class="badge ${CST[c.status][1]}">${CST[c.status][0]}</span></td><td>${esc(c.decided_by)}</td></tr>`).join('')}</tbody></table>` : ''}`;
    body.querySelectorAll('[data-hd]').forEach((b) => (b.onclick = () => { const h = r.history.find((x) => x.period === b.dataset.hd); showDetail(h, `${r.company.name}: ${h.label}`); }));
  }

  async function decide(id, decision) {
    const p = adm.data.pending.find((x) => x.correction_id === id);
    const body = modal(decision === 'approve' ? 'Погодити виправлення' : 'Відхилити запит', `<p><b>${esc(p.name)}</b>, ${esc(p.period_label)}<br><span class="muted">${esc(p.reason)}</span></p><label for="dc">Коментар для відповідальних (необов’язково)</label><textarea id="dc"></textarea><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn ${decision === 'reject' ? 'danger' : ''}" id="dcGo">${decision === 'approve' ? 'Погодити' : 'Відхилити'}</button></div>`);
    $('#dcGo', body).onclick = async (e) => {
      busy(e.target, true);
      const r = await api('admin_decide', { correction_id: id, decision, comment: $('#dc', body).value });
      busy(e.target, false);
      if (!r.ok) return toast(r.error, true);
      $('#modal').close(); toast(r.message); renderAdmin();
    };
  }

  function exportCsv() {
    const cols = ['code', 'name', 'segment', 'region', 'status', 'late', 'entered_by', 'entered_at', 'first_entered_at', 'version', 'hc_end', 'hc_avg', 'fop_total', 'avg_salary', 'open_q', 'answered_q', 'pending_corr', 'manager_email'];
    const lines = [cols.join(';')].concat(filtered().map((c) => cols.map((k) => `"${String(c[k] ?? '').replace(/"/g, '""')}"`).join(';')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `hsp_${adm.period}.csv`; a.click();
  }

  // ---------------- старт ----------------
  async function boot() {
    try {
      if (CFG.DEMO) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'demo.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      FIELDS = await (await fetch('fields.json', { cache: 'no-cache' })).json();
      FLAT = FIELDS.sections.flatMap((s) => s.fields);
    } catch (e) { app.innerHTML = '<div class="banner bad">Не вдалося завантажити портал. Оновіть сторінку.</div>'; return; }
    route();
  }
  boot();
})();

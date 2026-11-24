/* Демо-режим: імітація API n8n у браузері на тестових даних (demo-data.json). Нічого не зберігається і не надсилається. */
(() => {
  let DB = null;
  const sessions = {};
  const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
  const GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const label = (p) => { const [y, m] = p.split('-'); return `${MONTHS[m - 1]} ${y}`; };
  const deadline = (p) => { const [y, m] = p.split('-').map(Number); return new Date(m === 12 ? y + 1 : y, m % 12, DB.deadline_day, 23, 59); };
  const fmtD = (d) => `${d.getDate()} ${GEN[d.getMonth()]} ${d.getFullYear()}`;
  const fmt = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const ok = (o) => ({ ok: true, ...o });
  const err = (e, extra) => ({ ok: false, error: e, ...extra });
  const vers = (cc, p) => DB.submissions.filter((s) => s.company_code === cc && s.period === p).sort((a, b) => a.version - b.version);
  const cur = (cc, p) => vers(cc, p).find((s) => s.is_current === 'yes');
  const P = () => DB.current_period;

  function editable(cc) {
    const res = {};
    if (!cur(cc, P())) res[P()] = 'Подання за звітний місяць';
    DB.corrections.filter((c) => c.company_code === cc && c.status === 'approved').forEach((c) => { res[c.period] = 'Виправлення погоджено'; });
    DB.questions.filter((q) => q.company_code === cc && q.status === 'open').forEach((q) => { res[q.period] = res[q.period] || 'Є питання щодо даних'; });
    return Object.entries(res).sort().reverse().map(([period, reason]) => ({ period, label: label(period), reason, deadline: fmtD(deadline(period)), prefill: cur(cc, period) ? cur(cc, period).data : null }));
  }
  function view(cc) {
    const c = DB.companies.find((x) => x.code === cc);
    const periods = [...new Set(DB.submissions.filter((s) => s.company_code === cc).map((s) => s.period))].sort().reverse();
    return {
      company: c, current_period: P(), current_period_label: label(P()), deadline: fmtD(deadline(P())),
      history: periods.map((p) => { const vs = vers(cc, p); const h = vs.find((v) => v.is_current === 'yes'); return { period: p, label: label(p), version: h.version, entered_by: h.entered_by, entered_at: fmt(h.entered_at), late: new Date(vs[0].entered_at) > deadline(p), data: h.data, versions: vs.map((v) => ({ version: v.version, entered_by: v.entered_by, entered_at: fmt(v.entered_at), reason: v.reason })) }; }),
      editable: editable(cc),
      questions: DB.questions.filter((q) => q.company_code === cc && q.status !== 'closed').map((q) => ({ ...q, period_label: label(q.period), created_at: fmt(q.created_at) })),
      corrections: DB.corrections.filter((x) => x.company_code === cc).map((x) => ({ ...x, period_label: label(x.period), requested_at: fmt(x.requested_at) })),
      responsibles: DB.users.filter((u) => u.company_code === cc).map((u) => ({ email: u.email, full_name: u.full_name })),
    };
  }

  window.HSP_DEMO_API = async (b) => {
    if (!DB) DB = await (await fetch('demo-data.json')).json();
    await new Promise((r) => setTimeout(r, 250));
    const code = String(b.code || '').toUpperCase();
    if (b.action === 'login') {
      if (String(b.otp).trim() !== '123456') return err('Невірний код організації або одноразовий пароль. У демо пароль — 123456.');
      const u = DB.users.find((x) => x.company_code === code);
      if (!u) return err('Код організації не знайдено. Спробуйте, наприклад, AGR01 або ADMIN.');
      const token = 'demo-' + Math.random().toString(36).slice(2);
      sessions[token] = { ...u };
      return ok({ token, role: u.role, full_name: u.full_name, email: u.email });
    }
    if (b.action === 'request_code') return ok({ message: 'Демо-режим: лист не надсилається. Використайте пароль 123456.' });
    const s = sessions[b.token];
    if (!s) return err('Сесія завершилась. Увійдіть знову.', { relogin: true });
    const now = new Date().toISOString();
    switch (b.action) {
      case 'me': return s.role === 'admin' ? ok({ role: 'admin', user: s }) : ok({ role: 'respondent', user: s, ...view(s.company_code) });
      case 'submit': {
        const cc = s.company_code;
        if (!editable(cc).some((e) => e.period === b.period)) return err('Дані за цей період уже подано.');
        const data = {}; Object.entries(b.data).forEach(([k, v]) => { data[k] = v === '' ? null : Number(String(v).replace(',', '.')); });
        data.comment = b.comment || '';
        const vs = vers(cc, b.period); vs.forEach((v) => { v.is_current = 'no'; });
        const appr = DB.corrections.filter((c) => c.company_code === cc && c.period === b.period && c.status === 'approved');
        const oq = DB.questions.filter((q) => q.company_code === cc && q.period === b.period && q.status === 'open');
        const version = vs.length + 1;
        DB.submissions.push({ company_code: cc, period: b.period, version, is_current: 'yes', entered_by: s.email, entered_at: now, reason: version === 1 ? 'initial' : appr.length ? 'correction' : 'clarification', data });
        appr.forEach((c) => { c.status = 'done'; });
        oq.forEach((q) => { q.status = 'answered'; q.answer_text = `Дані виправлено (версія ${version})`; });
        return ok({ version, message: `Дані за ${label(b.period)} прийнято (демо).` });
      }
      case 'answer_question': {
        const q = DB.questions.find((x) => x.question_id === b.question_id);
        if (!b.answer || b.answer.length < 10) return err('Опишіть пояснення детальніше (щонайменше 10 символів).');
        q.status = 'answered'; q.answer_text = `Пояснення (${s.email}): ${b.answer}`;
        return ok({ message: 'Пояснення збережено (демо).' });
      }
      case 'correction_request':
        if (!b.reason || b.reason.length < 10) return err('Опишіть причину виправлення (щонайменше 10 символів).');
        DB.corrections.push({ correction_id: 'K-' + Date.now(), company_code: s.company_code, period: b.period, requested_by: s.email, requested_at: now, reason: b.reason, status: 'pending', decided_by: '', decision_comment: '', source: 'respondent' });
        return ok({ message: 'Запит надіслано адміністратору (демо).' });
      case 'admin_dashboard': {
        const p = b.period || P(); const dl = deadline(p);
        const list = DB.companies.map((c) => {
          const vs = vers(c.code, p); const h = vs.find((v) => v.is_current === 'yes');
          return { code: c.code, name: c.name, segment: c.segment, region: c.region, manager_email: c.manager_email, status: h ? 'submitted' : 'missing', late: vs[0] ? new Date(vs[0].entered_at) > dl : new Date() > dl, version: h ? h.version : 0, first_entered_at: vs[0] ? fmt(vs[0].entered_at) : '', entered_by: h ? h.entered_by : '', entered_at: h ? fmt(h.entered_at) : '', hc_end: h ? h.data.hc_end : null, hc_avg: h ? h.data.hc_avg : null, fop_total: h ? h.data.fop_total : null, avg_salary: h ? h.data.avg_salary : null,
            open_q: DB.questions.filter((q) => q.company_code === c.code && q.period === p && q.status === 'open').length, answered_q: DB.questions.filter((q) => q.company_code === c.code && q.period === p && q.status === 'answered').length,
            pending_corr: DB.corrections.filter((x) => x.company_code === c.code && x.status === 'pending').length, responsibles: DB.users.filter((u) => u.company_code === c.code).map((u) => u.email) };
        });
        const sub = list.filter((r) => r.status === 'submitted');
        const tl = {}; sub.forEach((r) => { const d = r.first_entered_at.slice(0, 10); tl[d] = (tl[d] || 0) + 1; });
        const segs = {}; list.forEach((r) => { segs[r.segment] = segs[r.segment] || { segment: r.segment, total: 0, submitted: 0 }; segs[r.segment].total++; if (r.status === 'submitted') segs[r.segment].submitted++; });
        const sa = sub.reduce((a, r) => a + (r.hc_avg || 0), 0); const sf = sub.reduce((a, r) => a + (r.fop_total || 0), 0);
        const toKey = (d) => d.split('.').reverse().join('');
        return ok({ period: p, period_label: label(p), deadline: fmtD(dl), deadline_passed: new Date() > dl,
          periods: [...new Set(DB.submissions.map((x) => x.period).concat(P()))].sort().reverse().map((x) => ({ period: x, label: label(x) })),
          summary: { total: list.length, submitted: sub.length, missing: list.length - sub.length, late: list.filter((r) => r.late).length, open_q: list.reduce((a, r) => a + r.open_q, 0), answered_q: list.reduce((a, r) => a + r.answered_q, 0), pending_corr: DB.corrections.filter((x) => x.status === 'pending').length, hc_end_total: sub.reduce((a, r) => a + (r.hc_end || 0), 0), avg_salary_group: sa ? Math.round(sf / sa) : null },
          timeline: Object.entries(tl).sort((a, b) => toKey(a[0]).localeCompare(toKey(b[0]))).map(([date, count]) => ({ date, count })),
          segments: Object.values(segs).sort((a, b) => a.segment.localeCompare(b.segment)), companies: list,
          pending: DB.corrections.filter((x) => x.status === 'pending').map((x) => ({ ...x, code: x.company_code, name: (DB.companies.find((c) => c.code === x.company_code) || {}).name, period_label: label(x.period), requested_at: fmt(x.requested_at) })) });
      }
      case 'admin_company': return ok(view(String(b.company_code).toUpperCase()));
      case 'admin_decide': {
        const c = DB.corrections.find((x) => x.correction_id === b.correction_id);
        c.status = b.decision === 'approve' ? 'approved' : 'rejected'; c.decided_by = s.email; c.decision_comment = b.comment || '';
        return ok({ message: c.status === 'approved' ? 'Виправлення погоджено (демо).' : 'Запит відхилено (демо).' });
      }
      default: return err('Дія недоступна.');
    }
  };
})();

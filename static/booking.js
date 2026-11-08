// Бронирование стола: дата → гости → время → стол на схеме → контакты → заявка (bot/booking_web.py)
(function () {
  const form = document.getElementById('bk-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const change = form.dataset.change || '';
  const maxGuests = +$('guests').dataset.max;
  const st = { date: form.querySelector('.bk-day').dataset.date, guests: +$('guests').value, time: null, table: null, data: null };
  const NS = 'http://www.w3.org/2000/svg';
  let req = 0;
  let autoNext = false;

  const plural = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? ' гость' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? ' гостя' : ' гостей');
  const dateLabel = (iso) => new Date(iso + 'T12:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

  async function load() {
    const my = ++req;
    $('slots').innerHTML = '<p class="muted">Загружаем свободное время…</p>';
    try {
      const q = new URLSearchParams({ date: st.date, guests: st.guests });
      if (change) q.set('change', change);
      const r = await fetch('/api/booking/slots?' + q, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      if (my !== req) return;
      st.data = data;
      // Сегодня поздно вечером мест уже нет — сразу показываем завтра
      if (!autoNext && !data.slots.some((s) => s.free.length)) {
        autoNext = true;
        const days = [...form.querySelectorAll('.bk-day')];
        const i = days.findIndex((x) => x.dataset.date === st.date);
        if (i === 0 && days[1]) { days[1].click(); return; }
      }
      autoNext = true;
      const slot = data.slots.find((s) => s.time === st.time && s.free.length);
      if (!slot) { st.time = null; st.table = null; }
      else if (st.table && !slot.free.includes(st.table)) st.table = null;
      draw();
    } catch (e) {
      if (my === req) $('slots').innerHTML = '<p class="bk-error">Не получилось загрузить время. Обновите страницу или позвоните нам.</p>';
    }
  }

  function draw() {
    const d = st.data;
    $('g-out').textContent = plural(st.guests);
    $('g-minus').disabled = st.guests <= 1;
    $('g-plus').disabled = st.guests >= maxGuests;
    $('dur').textContent = d ? '· бронь на ' + (d.duration % 60 ? (d.duration / 60).toFixed(1).replace('.', ',') : d.duration / 60) + ' ч' : '';
    // время
    const box = $('slots');
    box.replaceChildren();
    if (d && !d.slots.length) box.innerHTML = '<p class="muted">На этот день онлайн-бронь уже закрыта. Выберите другой день или позвоните.</p>';
    if (d && d.slots.length && !d.slots.some((s) => s.free.length)) box.insertAdjacentHTML('beforeend', '<p class="muted">На этот день всё занято для компании такого размера. Попробуйте другой день или позвоните — постараемся помочь.</p>');
    (d ? d.slots : []).forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'bk-slot'; b.textContent = s.time;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(s.time === st.time));
      b.disabled = !s.free.length;
      if (b.disabled) b.title = 'Нет свободных столов';
      b.addEventListener('click', () => { st.time = s.time; if (st.table && !s.free.includes(st.table)) st.table = null; draw(); });
      box.appendChild(b);
    });
    drawFloor();
    // итог
    $('s-date').textContent = dateLabel(st.date);
    $('s-time').textContent = st.time || '—';
    $('s-guests').textContent = plural(st.guests);
    const t = d && st.table ? d.tables.find((x) => x.id === st.table) : null;
    $('s-table').textContent = t ? '№' + t.name : 'подберём';
    $('submit').disabled = !st.time;
  }

  function drawFloor() {
    const svg = $('floor');
    svg.replaceChildren();
    const d = st.data;
    if (!d) return;
    const slot = st.time ? d.slots.find((s) => s.time === st.time) : null;
    d.tables.forEach((t0) => {
      const P = 9;
      const t = { ...t0, x: t0.x - P, y: t0.y - P, w: t0.w + 2 * P, h: t0.h + 2 * P };
      const fits = t.seats_min <= st.guests && st.guests <= t.seats_max;
      const free = slot ? slot.free.includes(t.id) : fits;
      const cls = !fits ? 'small' : !free ? 'busy' : st.table === t.id ? 'sel' : 'free';
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'tb ' + cls);
      const label = `Стол ${t.name}, до ${t.seats_max} мест, ${cls === 'small' ? 'не подходит по размеру' : cls === 'busy' ? 'занят' : 'свободен'}`;
      g.setAttribute('aria-label', label);
      // стулья вокруг стола
      const chair = (x, y, w, h) => { const r = document.createElementNS(NS, 'rect'); Object.entries({ x, y, width: w, height: h, rx: 4, class: 'chair' }).forEach(([k, v]) => r.setAttribute(k, v)); g.appendChild(r); };
      const cw = 22, ch = 9, gap = 5;
      const perSide = Math.max(1, Math.round(t.h / 75));
      chair(t.x + t.w / 2 - cw / 2, t.y - ch - gap, cw, ch);
      chair(t.x + t.w / 2 - cw / 2, t.y + t.h + gap, cw, ch);
      for (let i = 0; i < perSide; i++) {
        const cy = t.y + (t.h / perSide) * (i + 0.5) - cw / 2;
        chair(t.x - ch - gap, cy, ch, cw);
        chair(t.x + t.w + gap, cy, ch, cw);
      }
      const r = document.createElementNS(NS, 'rect');
      Object.entries({ x: t.x, y: t.y, width: t.w, height: t.h, rx: t.shape === 'round' ? Math.min(t.w, t.h) / 2 : 10, class: 'top' }).forEach(([k, v]) => r.setAttribute(k, v));
      g.appendChild(r);
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', t.x + t.w / 2); tx.setAttribute('y', t.y + t.h / 2 + 1);
      tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('dominant-baseline', 'middle');
      tx.textContent = t.name;
      g.appendChild(tx);
      const sub = document.createElementNS(NS, 'text');
      sub.setAttribute('x', t.x + t.w / 2); sub.setAttribute('y', t.y + t.h / 2 + 19);
      sub.setAttribute('text-anchor', 'middle'); sub.setAttribute('class', 'seats');
      sub.textContent = 'до ' + t.seats_max;
      g.appendChild(sub);
      if (cls === 'free' || cls === 'sel') {
        g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0');
        g.setAttribute('aria-pressed', String(cls === 'sel'));
        const pick = () => {
          if (!st.time) { $('table-hint').textContent = 'Сначала выберите время — покажем, какие столы свободны.'; return; }
          st.table = st.table === t.id ? null : t.id; draw();
        };
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      }
      svg.appendChild(g);
    });
  }

  form.querySelectorAll('.bk-day').forEach((b) => b.addEventListener('click', () => {
    form.querySelectorAll('.bk-day').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    st.date = b.dataset.date; load();
  }));
  $('g-minus').addEventListener('click', () => { if (st.guests > 1) { st.guests--; load(); } });
  $('g-plus').addEventListener('click', () => { if (st.guests < maxGuests) { st.guests++; load(); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('error');
    err.hidden = true;
    const body = { date: st.date, time: st.time, guests: st.guests, table_id: st.table, change, consent: true };
    if (!change) {
      Object.assign(body, { name: $('name').value.trim(), phone: $('phone').value.trim(), comment: $('comment').value.trim(),
        website: $('website').value, consent: $('consent').checked });
      const miss = !body.name ? 'Укажите имя.' : !body.phone ? 'Укажите телефон.' : !body.consent ? 'Отметьте согласие на обработку данных.' : '';
      if (miss) { err.textContent = miss; err.hidden = false; return; }
    }
    $('submit').disabled = true;
    try {
      const r = await fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { err.textContent = j.error || 'Не получилось отправить заявку.'; err.hidden = false; $('submit').disabled = false; load(); return; }
      form.hidden = true;
      $('done').hidden = false;
      $('done-title').textContent = change ? 'Перенос ждёт подтверждения' : 'Ждёт подтверждения';
      $('done-text').textContent = `${j.when[0].toUpperCase() + j.when.slice(1)}, ${j.guests}${j.table ? ', стол №' + j.table : ''}. Администратор подтвердит бронь в ближайшее время.`;
      $('done-tg').href = j.telegram;
      $('done-tg').hidden = !!j.tg_connected;
      $('done-manage').href = j.manage;
      $('done').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (x) {
      err.textContent = 'Нет связи с сайтом. Проверьте интернет или позвоните нам.'; err.hidden = false; $('submit').disabled = false;
    }
  });

  load();
})();

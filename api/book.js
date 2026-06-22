// Приём заявок с сайта → сохраняем в хранилище + шлём уведомление Марии.
// group → добавляем человека в занятие (место списывается); individual → в список индивидуальных.
const { getJSON, setJSON, tg, esc, hasRedis } = require('../lib/core');

const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method not allowed' }); return; }

  // ADMIN_CHAT_ID может содержать несколько получателей через запятую (Иван, Маша…)
  const CHATS = String(process.env.ADMIN_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!process.env.BOT_TOKEN || !CHATS.length) { res.status(500).json({ ok: false, error: 'server not configured' }); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const name = String(b.name || '').trim();
  const contact = String(b.contact || '').trim();
  if (!name || !contact) { res.status(400).json({ ok: false, error: 'name and contact required' }); return; }

  let text;

  if (b.type === 'group') {
    let label = b.slot;
    let tail = '';
    if (hasRedis() && b.slotId) {
      try {
        const slots = await getJSON('slots', []);
        const i = slots.findIndex((s) => s.id === b.slotId);
        if (i === -1) { res.status(409).json({ ok: false, error: 'slot not found' }); return; }
        const s = slots[i];
        const bookings = Array.isArray(s.bookings) ? s.bookings : [];
        if (bookings.length >= s.seats) { res.status(409).json({ ok: false, error: 'full' }); return; }
        bookings.push({ id: newId('b'), name, contact, ts: Date.now() });
        s.bookings = bookings;
        slots[i] = s;
        await setJSON('slots', slots);
        label = s.format + ' · ' + s.date + ' ' + s.time;
        tail = '\n🎟 Осталось мест: <b>' + Math.max(0, s.seats - bookings.length) + '</b> из ' + s.seats;
      } catch (e) { /* не вышло сохранить — всё равно уведомим */ }
    }
    text = '🟣 <b>Запись в группу</b>\n📅 ' + esc(label) + '\n👤 <b>' + esc(name) + '</b>\n📞 ' + esc(contact) + tail;
  } else {
    if (hasRedis()) {
      try {
        const list = await getJSON('individuals', []);
        list.push({ id: newId('i'), name, contact, format: b.format || '', date: b.date || '', size: b.size || '', note: b.note || '', ts: Date.now() });
        await setJSON('individuals', list);
      } catch (e) { /* уведомление всё равно отправим */ }
    }
    const lines = ['🟢 <b>Индивидуальная заявка</b>', '👤 <b>' + esc(name) + '</b>', '📞 ' + esc(contact)];
    if (b.format && b.format !== 'Пока не выбрала') lines.push('🎨 ' + esc(b.format));
    if (b.date) lines.push('📅 ' + esc(b.date));
    if (b.size) lines.push('👥 ' + esc(b.size));
    if (b.note) lines.push('💬 ' + esc(b.note));
    text = lines.join('\n');
  }

  // Рассылаем заявку каждому получателю. Успех, если дошло хотя бы одному
  // (если кто-то ещё не нажал «Старт» у бота — его пропускаем, остальным уходит).
  let sentOk = false; let lastErr = '';
  for (const chat of CHATS) {
    try {
      const r = await tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
      if (r.ok) sentOk = true; else lastErr = r.description || 'telegram error';
    } catch (e) { lastErr = String(e.message || e); }
  }
  if (sentOk) res.status(200).json({ ok: true });
  else res.status(502).json({ ok: false, error: lastErr });
};

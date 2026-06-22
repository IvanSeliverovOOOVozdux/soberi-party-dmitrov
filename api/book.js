// Приём заявок с сайта → Telegram Марии. Для групповых занятий уменьшает число свободных мест.
// Env: BOT_TOKEN, ADMIN_CHAT_ID, (опц.) хранилище Redis для учёта мест.
const { getJSON, setJSON, tg, esc, hasRedis } = require('../lib/core');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method not allowed' }); return; }

  const CHAT = process.env.ADMIN_CHAT_ID;
  if (!process.env.BOT_TOKEN || !CHAT) { res.status(500).json({ ok: false, error: 'server not configured' }); return; }

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
        if ((s.taken || 0) >= s.seats) { res.status(409).json({ ok: false, error: 'full' }); return; }
        s.taken = (s.taken || 0) + 1;
        slots[i] = s;
        await setJSON('slots', slots);
        label = s.format + ' · ' + s.date + ' ' + s.time;
        const left = Math.max(0, s.seats - s.taken);
        tail = '\n🎟 Осталось мест: <b>' + left + '</b> из ' + s.seats;
      } catch (e) { /* не вышло обновить места — всё равно уведомим */ }
    }
    text = '🟣 <b>Запись в группу</b>\n📅 ' + esc(label) + '\n👤 <b>' + esc(name) + '</b>\n📞 ' + esc(contact) + tail;
  } else {
    const lines = ['🟢 <b>Индивидуальная заявка</b>', '👤 <b>' + esc(name) + '</b>', '📞 ' + esc(contact)];
    if (b.format && b.format !== 'Пока не выбрала') lines.push('🎨 ' + esc(b.format));
    if (b.date) lines.push('📅 ' + esc(b.date));
    if (b.size) lines.push('👥 ' + esc(b.size));
    if (b.note) lines.push('💬 ' + esc(b.note));
    text = lines.join('\n');
  }

  try {
    const r = await tg('sendMessage', { chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) throw new Error(r.description || 'telegram error');
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e) });
  }
};

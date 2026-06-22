// Приём заявок с сайта → отправка в Telegram Марии.
// Env-переменные (задаются в Vercel): BOT_TOKEN, ADMIN_CHAT_ID.
// BOT_TOKEN — токен от @BotFather, ADMIN_CHAT_ID — куда слать заявки (id чата/человека).

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const TOKEN = process.env.BOT_TOKEN;
  const CHAT  = process.env.ADMIN_CHAT_ID;
  if (!TOKEN || !CHAT) {
    res.status(500).json({ ok: false, error: 'server not configured' });
    return;
  }

  // тело может прийти уже распаршенным (Vercel) или строкой
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  // простая защита от пустых/спам-заявок
  const name = String(b.name || '').trim();
  const contact = String(b.contact || '').trim();
  if (!name || !contact) {
    res.status(400).json({ ok: false, error: 'name and contact required' });
    return;
  }

  let text;
  if (b.type === 'group') {
    text =
      '🟣 <b>Запись в группу</b>\n' +
      '📅 Занятие: <b>' + esc(b.slot) + '</b>\n' +
      '👤 Имя: <b>' + esc(name) + '</b>\n' +
      '📞 Контакт: ' + esc(contact);
  } else {
    const lines = [
      '🟢 <b>Индивидуальная заявка</b>',
      '👤 Имя: <b>' + esc(name) + '</b>',
      '📞 Контакт: ' + esc(contact),
    ];
    if (b.format && b.format !== 'Пока не выбрала') lines.push('🎨 Формат: ' + esc(b.format));
    if (b.date) lines.push('📅 Желаемая дата: ' + esc(b.date));
    if (b.size) lines.push('👥 Человек: ' + esc(b.size));
    if (b.note) lines.push('💬 Комментарий: ' + esc(b.note));
    text = lines.join('\n');
  }

  try {
    const tg = await fetch('https://api.telegram.org/bot' + TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const data = await tg.json();
    if (!data.ok) throw new Error(data.description || 'telegram error');
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e) });
  }
};

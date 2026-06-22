// Telegram-бот расписания (для Маши): добавление/просмотр/удаление занятий кнопками.
// Webhook: https://<домен>/api/bot . Доступ — только chat_id из ADMIN_CHAT_ID (через запятую можно несколько).
const crypto = require('crypto');
const { hasRedis, getJSON, setJSON, del, tg, esc, todayMsk } = require('../lib/core');

const TOKEN = process.env.BOT_TOKEN || '';
const ADMINS = String(process.env.ADMIN_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
// секрет вебхука выводим из токена — не храним отдельно и не светим в репозитории
const SECRET = TOKEN ? crypto.createHash('sha256').update(TOKEN).digest('hex').slice(0, 40) : '';

const FORMATS = [
  'Керамика', 'Картина с подсветкой', 'Картина из смолы', 'Bearbrick · Fluid Art',
  'Часы из смолы', 'Текстурная картина', 'Рисование вином', 'Роспись бокалов',
  'Картина-аффирмация', 'Сумочка макраме', 'Роспись одежды/шопера', 'Обвес из глины', 'Именные крабики',
];
const MONTHS = ['', 'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const isAdmin = (id) => ADMINS.includes(String(id));
const dateHuman = (iso) => { const p = iso.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1]]; };

const menuKb = () => ({ inline_keyboard: [
  [{ text: '➕ Добавить занятие', callback_data: 'add' }],
  [{ text: '📋 Расписание', callback_data: 'list' }],
] });
function formatsKb() {
  const rows = [];
  for (let i = 0; i < FORMATS.length; i += 2) {
    const r = [{ text: FORMATS[i], callback_data: 'f' + i }];
    if (FORMATS[i + 1]) r.push({ text: FORMATS[i + 1], callback_data: 'f' + (i + 1) });
    rows.push(r);
  }
  rows.push([{ text: '✖ Отмена', callback_data: 'cancel' }]);
  return { inline_keyboard: rows };
}
const seatsKb = () => ({ inline_keyboard: [
  [2, 4, 6, 8, 10].map((n) => ({ text: String(n), callback_data: 's' + n })),
  [{ text: 'Другое число', callback_data: 'sc' }, { text: '✖ Отмена', callback_data: 'cancel' }],
] });

const showMenu = (chatId, text) =>
  tg('sendMessage', { chat_id: chatId, text: text || 'Меню расписания. Что сделать?', reply_markup: menuKb() });

async function renderList(chatId, messageId) {
  const slots = (await getJSON('slots', [])).filter((s) => s.date >= todayMsk())
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!slots.length) {
    const p = { chat_id: chatId, text: 'Занятий пока нет. Добавь первое 👇', reply_markup: menuKb() };
    if (messageId) { p.message_id = messageId; return tg('editMessageText', p); }
    return tg('sendMessage', p);
  }
  const rows = slots.map((s) => {
    const left = Math.max(0, s.seats - (s.taken || 0));
    return [
      { text: `${dateHuman(s.date)} ${s.time} · ${s.format} · ${left}/${s.seats}`, callback_data: 'noop' },
      { text: '❌', callback_data: 'd' + s.id },
    ];
  });
  rows.push([{ text: '➕ Добавить', callback_data: 'add' }]);
  const p = { chat_id: chatId, text: '📋 Текущее расписание (❌ — удалить):', reply_markup: { inline_keyboard: rows } };
  if (messageId) { p.message_id = messageId; return tg('editMessageText', p); }
  return tg('sendMessage', p);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(200).send('ok'); return; }
  if (SECRET && req.headers['x-telegram-bot-api-secret-token'] !== SECRET) { res.status(401).send('no'); return; }
  let u = req.body;
  if (typeof u === 'string') { try { u = JSON.parse(u); } catch { u = {}; } }
  u = u || {};
  try { await handle(u); } catch (e) { /* проглатываем, чтобы Telegram не ретраил бесконечно */ }
  res.status(200).json({ ok: true });
};

async function handle(u) {
  if (u.callback_query) return onCallback(u.callback_query);
  if (u.message && u.message.text) return onMessage(u.message);
}

async function onMessage(msg) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from && msg.from.id)) {
    return tg('sendMessage', { chat_id: chatId, text: 'Этот бот — для управления расписанием студии Soberi Party.' });
  }
  const txt = msg.text.trim();
  if (/^\/start|^меню|^menu/i.test(txt)) { await del('state:' + chatId); return showMenu(chatId, 'Привет! Это бот расписания Soberi Party.'); }
  if (!hasRedis()) return tg('sendMessage', { chat_id: chatId, text: '⚠️ База расписания ещё не подключена.' });

  const st = await getJSON('state:' + chatId, null);
  if (st && st.step === 'datetime') return inputDatetime(chatId, txt, st);
  if (st && st.step === 'seatscustom') return inputSeatsCustom(chatId, txt, st);
  return showMenu(chatId);
}

async function onCallback(cq) {
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data = cq.data || '';
  const ack = (text) => tg('answerCallbackQuery', { callback_query_id: cq.id, text: text || '' });
  if (!isAdmin(cq.from.id)) { return ack('Нет доступа'); }

  if (data === 'noop') return ack();
  if (data === 'cancel') {
    await del('state:' + chatId); await ack('Отменено');
    return tg('editMessageText', { chat_id: chatId, message_id: messageId, text: 'Отменено.', reply_markup: menuKb() });
  }
  if (!hasRedis()) { await ack(); return tg('editMessageText', { chat_id: chatId, message_id: messageId, text: '⚠️ База расписания ещё не подключена. Создай хранилище в Vercel → Storage.' }); }

  if (data === 'add') {
    await setJSON('state:' + chatId, { step: 'format', draft: {} }); await ack();
    return tg('editMessageText', { chat_id: chatId, message_id: messageId, text: 'Шаг 1 из 3. Выбери формат:', reply_markup: formatsKb() });
  }
  if (data === 'list') { await ack(); return renderList(chatId, messageId); }

  if (data[0] === 'f') {
    const i = +data.slice(1); const fmt = FORMATS[i]; if (!fmt) return ack();
    const st = await getJSON('state:' + chatId, { draft: {} });
    st.step = 'datetime'; st.draft = st.draft || {}; st.draft.format = fmt;
    await setJSON('state:' + chatId, st); await ack();
    return tg('editMessageText', { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
      text: `Формат: <b>${esc(fmt)}</b>\n\nШаг 2 из 3. Напиши дату и время сообщением, например:\n<code>28.06 18:00</code>` });
  }
  if (data === 'sc') {
    const st = await getJSON('state:' + chatId, null); if (!st) return ack();
    st.step = 'seatscustom'; await setJSON('state:' + chatId, st); await ack();
    return tg('editMessageText', { chat_id: chatId, message_id: messageId, text: 'Напиши число мест сообщением (например 7):' });
  }
  if (data[0] === 's') { return finalizeSeats(chatId, messageId, +data.slice(1), ack); }
  if (data[0] === 'd') {
    const id = data.slice(1);
    let slots = await getJSON('slots', []); slots = slots.filter((s) => s.id !== id);
    await setJSON('slots', slots); await ack('Удалено');
    return renderList(chatId, messageId);
  }
  return ack();
}

async function inputDatetime(chatId, txt, st) {
  const m = txt.match(/^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\s+(\d{1,2})[:.](\d{2})$/);
  if (!m) return tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: 'Не понял. Напиши дату и время так:\n<code>28.06 18:00</code>' });
  let dd = +m[1], mm = +m[2], hh = +m[4], mi = +m[5];
  let year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +todayMsk().slice(0, 4);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59) return tg('sendMessage', { chat_id: chatId, text: 'Проверь дату и время.' });
  st.draft.date = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  st.draft.time = `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  st.step = 'seats'; await setJSON('state:' + chatId, st);
  return tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
    text: `Дата: <b>${dateHuman(st.draft.date)} ${st.draft.time}</b>\n\nШаг 3 из 3. Сколько мест в группе?`, reply_markup: seatsKb() });
}

async function inputSeatsCustom(chatId, txt, st) {
  const n = parseInt(txt, 10);
  if (!n || n < 1 || n > 100) return tg('sendMessage', { chat_id: chatId, text: 'Напиши число от 1 до 100.' });
  return finalizeSeats(chatId, null, n, async () => {});
}

async function finalizeSeats(chatId, messageId, n, ack) {
  if (!n || n < 1) return ack();
  const st = await getJSON('state:' + chatId, null);
  if (!st || !st.draft || !st.draft.format || !st.draft.date) {
    await ack(); await del('state:' + chatId); return showMenu(chatId, 'Что-то сбилось, начнём заново.');
  }
  const slot = {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    format: st.draft.format, date: st.draft.date, time: st.draft.time, seats: n, taken: 0,
  };
  const slots = await getJSON('slots', []); slots.push(slot); await setJSON('slots', slots);
  await del('state:' + chatId); await ack('Добавлено');
  const text = `✅ Занятие добавлено:\n<b>${esc(slot.format)}</b>\n📅 ${dateHuman(slot.date)} ${slot.time}\n🎟 Мест: ${slot.seats}\n\nУже на сайте во вкладке «По расписанию».`;
  if (messageId) await tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' });
  else await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
  return showMenu(chatId);
}

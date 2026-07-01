// Telegram-бот расписания Soberi Party (админка для Маши).
// Меню: 📋 Расписание · ➕ Добавить занятие · 📨 Заявки.
// Доступ — только chat_id из ADMIN_CHAT_ID (можно несколько через запятую).
const crypto = require('crypto');
const { hasRedis, getJSON, setJSON, del, tg, esc, todayMsk } = require('../lib/core');

const TOKEN = process.env.BOT_TOKEN || '';
const ADMINS = String(process.env.ADMIN_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
const SECRET = TOKEN ? crypto.createHash('sha256').update(TOKEN).digest('hex').slice(0, 40) : '';

const FORMATS = [
  'Керамика', 'Картина с подсветкой', 'Картина из смолы', 'Bearbrick · Fluid Art',
  'Часы из смолы', 'Текстурная картина', 'Картина с лимонами и ягодами', 'Рисование вином', 'Роспись бокалов',
  'Картина-аффирмация', 'Сумочка макраме', 'Роспись одежды/шопера', 'Обвес из глины', 'Именные крабики',
];
const MONTHS = ['', 'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const PAGE = 6;

const isAdmin = (id) => ADMINS.includes(String(id));
const dateHuman = (iso) => { const p = iso.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1]]; };
const taken = (s) => (Array.isArray(s.bookings) ? s.bookings.length : 0);
const MENU_RK = { keyboard: [[{ text: '🏠 Главное меню' }]], resize_keyboard: true, is_persistent: true };

const slotsGet = () => getJSON('slots', []);
const slotsSave = (s) => setJSON('slots', s);
const indGet = () => getJSON('individuals', []);
const indSave = (l) => setJSON('individuals', l);
const upcoming = (slots) => slots.filter((s) => s.date >= todayMsk()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const findSlot = (slots, id) => slots.find((s) => s.id === id);

// ─── отправка/редактирование ───
const send = (chatId, text, kb) => tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
const edit = (cq, text, kb) => tg('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });

const btn = (text, data) => ({ text, callback_data: data });
const navRow = (back) => [back ? btn('◀ Назад', back) : null, btn('🏠 Меню', 'menu')].filter(Boolean);

// ─── экраны (возвращают {text, kb}) ───
function vMenu() {
  return {
    text: '🌸 <b>Soberi Party — расписание</b>\nВыбери раздел:',
    kb: { inline_keyboard: [
      [btn('📋 Расписание', 'sch:0')],
      [btn('➕ Добавить занятие', 'add')],
      [btn('📨 Заявки', 'inb')],
    ] },
  };
}

async function vSchedule(page) {
  const list = upcoming(await slotsGet());
  if (!list.length) return { text: '📋 Занятий пока нет.\nДобавь первое 👇', kb: { inline_keyboard: [[btn('➕ Добавить занятие', 'add')], [btn('🏠 Меню', 'menu')]] } };
  const pages = Math.ceil(list.length / PAGE);
  page = Math.max(0, Math.min(page, pages - 1));
  const rows = list.slice(page * PAGE, page * PAGE + PAGE).map((s) => {
    const left = Math.max(0, s.seats - taken(s));
    return [btn(`${dateHuman(s.date)} ${s.time} · ${s.format} · ${left}/${s.seats}`, 'slot:' + s.id)];
  });
  const nav = [];
  if (page > 0) nav.push(btn('◀', 'sch:' + (page - 1)));
  if (page < pages - 1) nav.push(btn('▶', 'sch:' + (page + 1)));
  if (nav.length) rows.push(nav);
  rows.push([btn('➕ Добавить', 'add'), btn('🏠 Меню', 'menu')]);
  return { text: `📋 <b>Расписание</b> (стр. ${page + 1}/${pages}).\nНажми на занятие, чтобы открыть:`, kb: { inline_keyboard: rows } };
}

async function vSlot(id) {
  const s = findSlot(await slotsGet(), id);
  if (!s) return { text: 'Занятие не найдено (возможно, удалено).', kb: { inline_keyboard: [[btn('◀ Расписание', 'sch:0'), btn('🏠 Меню', 'menu')]] } };
  const left = Math.max(0, s.seats - taken(s));
  const text = `<b>${esc(s.format)}</b>\n📅 ${dateHuman(s.date)} ${s.time}\n🎟 Мест: ${s.seats} · занято ${taken(s)} · свободно <b>${left}</b>`;
  return { text, kb: { inline_keyboard: [
    [btn('✏️ Изменить', 'ed:' + id), btn('🗑 Удалить', 'del:' + id)],
    [btn(`👥 Заявки (${taken(s)})`, 'bk:' + id)],
    navRow('sch:0'),
  ] } };
}

async function vEdit(id) {
  const s = findSlot(await slotsGet(), id);
  if (!s) return vSlot(id);
  return { text: `✏️ Что изменить?\n<b>${esc(s.format)}</b> · ${dateHuman(s.date)} ${s.time} · ${s.seats} мест`, kb: { inline_keyboard: [
    [btn('🎨 Формат', 'edf:' + id)],
    [btn('📅 Дата и время', 'edt:' + id)],
    [btn('🎟 Число мест', 'eds:' + id)],
    navRow('slot:' + id),
  ] } };
}

async function vDelConfirm(id) {
  const s = findSlot(await slotsGet(), id);
  if (!s) return vSlot(id);
  return { text: `🗑 Удалить занятие?\n<b>${esc(s.format)}</b> · ${dateHuman(s.date)} ${s.time}${taken(s) ? `\n⚠️ На него уже ${taken(s)} заявок!` : ''}`, kb: { inline_keyboard: [
    [btn('✅ Да, удалить', 'dely:' + id)],
    [btn('◀ Нет, назад', 'slot:' + id)],
  ] } };
}

async function vBookings(id) {
  const s = findSlot(await slotsGet(), id);
  if (!s) return vSlot(id);
  const list = Array.isArray(s.bookings) ? s.bookings : [];
  const head = `👥 <b>Заявки на занятие</b>\n${esc(s.format)} · ${dateHuman(s.date)} ${s.time}\nЗанято ${list.length} из ${s.seats}`;
  if (!list.length) return { text: head + '\n\nЗаявок пока нет.', kb: { inline_keyboard: [navRow('slot:' + id)] } };
  const rows = list.map((b) => [btn(`${b.name} · ${b.contact}`, 'noop'), btn('❌', `bkd:${id}:${b.id}`)]);
  rows.push(navRow('slot:' + id));
  return { text: head + '\n\nНажми ❌, чтобы убрать (место освободится):', kb: { inline_keyboard: rows } };
}

function vInbox() {
  return { text: '📨 <b>Заявки</b>\nВыбери, что посмотреть:', kb: { inline_keyboard: [
    [btn('👥 На занятия (группы)', 'inbg')],
    [btn('🙋 Индивидуальные', 'inbi:0')],
    [btn('🏠 Меню', 'menu')],
  ] } };
}

async function vInboxGroups() {
  const list = upcoming(await slotsGet());
  if (!list.length) return { text: '👥 Групповых занятий нет.', kb: { inline_keyboard: [navRow('inb')] } };
  const rows = list.map((s) => [btn(`${dateHuman(s.date)} ${s.time} · ${s.format} · заявок ${taken(s)}`, 'bk:' + s.id)]);
  rows.push(navRow('inb'));
  return { text: '👥 <b>Заявки по занятиям</b>\nВыбери занятие:', kb: { inline_keyboard: rows } };
}

async function vIndividuals(page) {
  const list = (await indGet()).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!list.length) return { text: '🙋 Индивидуальных заявок пока нет.', kb: { inline_keyboard: [navRow('inb')] } };
  const pages = Math.ceil(list.length / PAGE);
  page = Math.max(0, Math.min(page, pages - 1));
  const rows = list.slice(page * PAGE, page * PAGE + PAGE).map((it) => {
    const extra = [it.format, it.date].filter(Boolean).join(' · ');
    return [btn(`${it.name} · ${it.contact}${extra ? ' · ' + extra : ''}`, 'noop'), btn('❌', 'idel:' + it.id)];
  });
  const nav = [];
  if (page > 0) nav.push(btn('◀', 'inbi:' + (page - 1)));
  if (page < pages - 1) nav.push(btn('▶', 'inbi:' + (page + 1)));
  if (nav.length) rows.push(nav);
  rows.push(navRow('inb'));
  return { text: `🙋 <b>Индивидуальные заявки</b> (стр. ${page + 1}/${pages}).\nНажми ❌, чтобы удалить:`, kb: { inline_keyboard: rows } };
}

// клавиатуры мастера/редактирования
function formatsKb(cb, backData) {
  const rows = [];
  for (let i = 0; i < FORMATS.length; i += 2) {
    const r = [btn(FORMATS[i], cb(i))];
    if (FORMATS[i + 1]) r.push(btn(FORMATS[i + 1], cb(i + 1)));
    rows.push(r);
  }
  rows.push(navRow(backData));
  return { inline_keyboard: rows };
}
function seatsKb(cb, customData, backData) {
  return { inline_keyboard: [
    [2, 4, 6, 8, 10].map((n) => btn(String(n), cb(n))),
    [btn('Другое число', customData), ...navRow(backData)],
  ] };
}

// ─── webhook ───
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(200).send('ok'); return; }
  if (SECRET && req.headers['x-telegram-bot-api-secret-token'] !== SECRET) { res.status(401).send('no'); return; }
  let u = req.body;
  if (typeof u === 'string') { try { u = JSON.parse(u); } catch { u = {}; } }
  u = u || {};
  try { await handle(u); } catch (e) { /* проглатываем, чтобы Telegram не ретраил */ }
  res.status(200).json({ ok: true });
};

async function handle(u) {
  if (u.callback_query) return onCallback(u.callback_query);
  if (u.message && u.message.text) return onMessage(u.message);
}

async function showMenuMsg(chatId, withWelcome) {
  if (withWelcome) await send(chatId, 'Готово! Постоянная кнопка «🏠 Главное меню» внизу.', MENU_RK);
  const v = vMenu();
  return send(chatId, v.text, v.kb);
}

async function onMessage(msg) {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from && msg.from.id)) {
    const uid = msg.from && msg.from.id;
    return send(chatId, '🌸 Это бот студии <b>Soberi Party</b> для управления расписанием.\n\nЕсли вы мастер студии и вам нужен доступ — перешлите администратору этот номер:\n<b>' + uid + '</b>');
  }
  const txt = msg.text.trim();
  if (/^\/start/i.test(txt)) { await del('state:' + chatId); return showMenuMsg(chatId, true); }
  if (/^\/menu$|^меню$|^🏠/i.test(txt)) { await del('state:' + chatId); return showMenuMsg(chatId, false); }
  if (!hasRedis()) return send(chatId, '⚠️ База расписания ещё не подключена.');

  const st = await getJSON('state:' + chatId, null);
  if (st && st.flow === 'add' && st.step === 'datetime') return addDatetime(chatId, txt, st);
  if (st && st.flow === 'add' && st.step === 'seatscustom') return finalizeAdd(chatId, null, parseInt(txt, 10), st);
  if (st && st.flow === 'editdt') return editDatetime(chatId, txt, st);
  if (st && st.flow === 'editsc') return editSeats(chatId, null, parseInt(txt, 10), st);
  return showMenuMsg(chatId, false);
}

async function onCallback(cq) {
  const chatId = cq.message.chat.id;
  const data = cq.data || '';
  const ack = (text, alert) => tg('answerCallbackQuery', { callback_query_id: cq.id, text: text || '', show_alert: !!alert });
  if (!isAdmin(cq.from.id)) return ack('Нет доступа');
  if (data === 'noop') return ack();

  // навигация по экранам
  if (data === 'menu') { await del('state:' + chatId); await ack(); const v = vMenu(); return edit(cq, v.text, v.kb); }
  if (data.startsWith('sch:')) { await ack(); const v = await vSchedule(+data.slice(4)); return edit(cq, v.text, v.kb); }
  if (data.startsWith('slot:')) { await ack(); const v = await vSlot(data.slice(5)); return edit(cq, v.text, v.kb); }
  if (data === 'inb') { await ack(); const v = vInbox(); return edit(cq, v.text, v.kb); }
  if (data === 'inbg') { await ack(); const v = await vInboxGroups(); return edit(cq, v.text, v.kb); }
  if (data.startsWith('inbi:')) { await ack(); const v = await vIndividuals(+data.slice(5)); return edit(cq, v.text, v.kb); }
  if (data.startsWith('bk:')) { await ack(); const v = await vBookings(data.slice(3)); return edit(cq, v.text, v.kb); }
  if (data.startsWith('ed:')) { await ack(); const v = await vEdit(data.slice(3)); return edit(cq, v.text, v.kb); }
  if (data.startsWith('del:')) { await ack(); const v = await vDelConfirm(data.slice(4)); return edit(cq, v.text, v.kb); }

  if (!hasRedis()) { await ack(); return edit(cq, '⚠️ База расписания ещё не подключена.'); }

  // удаление занятия
  if (data.startsWith('dely:')) {
    const id = data.slice(5); let slots = await slotsGet(); slots = slots.filter((s) => s.id !== id);
    await slotsSave(slots); await ack('Удалено'); const v = await vSchedule(0); return edit(cq, v.text, v.kb);
  }
  // удалить человека из занятия (освобождает место)
  if (data.startsWith('bkd:')) {
    const [, id, bid] = data.split(':'); const slots = await slotsGet(); const s = findSlot(slots, id);
    if (s) { s.bookings = (s.bookings || []).filter((b) => b.id !== bid); await slotsSave(slots); }
    await ack('Заявка убрана, место свободно'); const v = await vBookings(id); return edit(cq, v.text, v.kb);
  }
  // удалить индивидуальную заявку
  if (data.startsWith('idel:')) {
    const bid = data.slice(5); let list = await indGet(); list = list.filter((x) => x.id !== bid);
    await indSave(list); await ack('Удалено'); const v = await vIndividuals(0); return edit(cq, v.text, v.kb);
  }

  // ── мастер добавления ──
  if (data === 'add') {
    await setJSON('state:' + chatId, { flow: 'add', step: 'format', draft: {} }); await ack();
    return edit(cq, 'Шаг 1 из 3. Выбери формат:', formatsKb((i) => 'f' + i, null));
  }
  if (data === 'wback') return wizardBack(cq, chatId, ack);
  if (/^f\d+$/.test(data)) {
    const fmt = FORMATS[+data.slice(1)]; if (!fmt) return ack();
    const st = await getJSON('state:' + chatId, { draft: {} }); st.flow = 'add'; st.step = 'datetime'; st.draft = st.draft || {}; st.draft.format = fmt;
    await setJSON('state:' + chatId, st); await ack();
    return edit(cq, `Формат: <b>${esc(fmt)}</b>\n\nШаг 2 из 3. Напиши дату и время сообщением, например:\n<code>28.06 18:00</code>`, { inline_keyboard: [navRow('wback')] });
  }
  if (/^s\d+$/.test(data)) { const st = await getJSON('state:' + chatId, null); return finalizeAdd(chatId, cq, +data.slice(1), st, ack); }
  if (data === 'sc') {
    const st = await getJSON('state:' + chatId, null); if (!st) return ack();
    st.step = 'seatscustom'; await setJSON('state:' + chatId, st); await ack();
    return edit(cq, 'Напиши число мест сообщением (например 7):', { inline_keyboard: [navRow('wback')] });
  }

  // ── редактирование занятия ──
  if (data.startsWith('edf:')) { await ack(); const id = data.slice(4); return edit(cq, 'Выбери новый формат:', formatsKb((i) => `efs:${id}:${i}`, 'ed:' + id)); }
  if (data.startsWith('efs:')) {
    const [, id, idx] = data.split(':'); const fmt = FORMATS[+idx]; const slots = await slotsGet(); const s = findSlot(slots, id);
    if (s && fmt) { s.format = fmt; await slotsSave(slots); } await ack('Формат изменён'); const v = await vSlot(id); return edit(cq, v.text, v.kb);
  }
  if (data.startsWith('edt:')) {
    const id = data.slice(4); await setJSON('state:' + chatId, { flow: 'editdt', slotId: id }); await ack();
    return edit(cq, 'Напиши новые дату и время сообщением, например:\n<code>28.06 18:00</code>', { inline_keyboard: [navRow('ed:' + id)] });
  }
  if (data.startsWith('eds:')) { await ack(); const id = data.slice(4); return edit(cq, 'Выбери число мест:', seatsKb((n) => `ess:${id}:${n}`, `esc:${id}`, 'ed:' + id)); }
  if (data.startsWith('ess:')) { const [, id, n] = data.split(':'); return editSeats(chatId, cq, +n, { slotId: id }, ack); }
  if (data.startsWith('esc:')) {
    const id = data.slice(4); await setJSON('state:' + chatId, { flow: 'editsc', slotId: id }); await ack();
    return edit(cq, 'Напиши новое число мест сообщением (например 7):', { inline_keyboard: [navRow('ed:' + id)] });
  }

  return ack();
}

async function wizardBack(cq, chatId, ack) {
  const st = await getJSON('state:' + chatId, null);
  if (!st) { await ack(); const v = vMenu(); return edit(cq, v.text, v.kb); }
  if (st.step === 'datetime') { st.step = 'format'; await setJSON('state:' + chatId, st); await ack(); return edit(cq, 'Шаг 1 из 3. Выбери формат:', formatsKb((i) => 'f' + i, null)); }
  // с шага мест — назад к вводу даты
  st.step = 'datetime'; await setJSON('state:' + chatId, st); await ack();
  return edit(cq, `Формат: <b>${esc(st.draft.format)}</b>\n\nШаг 2 из 3. Напиши дату и время, например:\n<code>28.06 18:00</code>`, { inline_keyboard: [navRow('wback')] });
}

function parseDateTime(txt) {
  const m = txt.match(/^(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\s+(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const dd = +m[1], mm = +m[2], hh = +m[4], mi = +m[5];
  const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +todayMsk().slice(0, 4);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59) return null;
  return { date: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, time: `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}` };
}

async function addDatetime(chatId, txt, st) {
  const dt = parseDateTime(txt);
  if (!dt) return send(chatId, 'Не понял. Напиши так:\n<code>28.06 18:00</code>');
  st.draft.date = dt.date; st.draft.time = dt.time; st.step = 'seats'; await setJSON('state:' + chatId, st);
  return send(chatId, `Дата: <b>${dateHuman(dt.date)} ${dt.time}</b>\n\nШаг 3 из 3. Сколько мест в группе?`, seatsKb((n) => 's' + n, 'sc', 'wback'));
}

async function finalizeAdd(chatId, cq, n, st, ack) {
  if (!n || n < 1 || n > 100) { if (ack) await ack('Выбери число', true); else await send(chatId, 'Напиши число от 1 до 100.'); return; }
  if (!st || !st.draft || !st.draft.format || !st.draft.date) { if (ack) await ack(); await del('state:' + chatId); return showMenuMsg(chatId, false); }
  const slot = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), format: st.draft.format, date: st.draft.date, time: st.draft.time, seats: n, bookings: [] };
  const slots = await slotsGet(); slots.push(slot); await slotsSave(slots); await del('state:' + chatId);
  if (ack) await ack('Добавлено');
  const text = `✅ Занятие добавлено:\n<b>${esc(slot.format)}</b>\n📅 ${dateHuman(slot.date)} ${slot.time}\n🎟 Мест: ${slot.seats}\n\nУже на сайте во вкладке «По расписанию».`;
  if (cq) await edit(cq, text, { inline_keyboard: [[btn('📋 Расписание', 'sch:0'), btn('🏠 Меню', 'menu')]] });
  else await send(chatId, text, { inline_keyboard: [[btn('📋 Расписание', 'sch:0'), btn('🏠 Меню', 'menu')]] });
}

async function editDatetime(chatId, txt, st) {
  const dt = parseDateTime(txt);
  if (!dt) return send(chatId, 'Не понял. Напиши так:\n<code>28.06 18:00</code>');
  const slots = await slotsGet(); const s = findSlot(slots, st.slotId);
  if (!s) { await del('state:' + chatId); return showMenuMsg(chatId, false); }
  s.date = dt.date; s.time = dt.time; await slotsSave(slots); await del('state:' + chatId);
  const v = await vSlot(st.slotId); return send(chatId, '✅ Дата изменена.\n\n' + v.text, v.kb);
}

async function editSeats(chatId, cq, n, st, ack) {
  const slots = await slotsGet(); const s = findSlot(slots, st.slotId);
  if (!s) { if (ack) await ack(); await del('state:' + chatId); return showMenuMsg(chatId, false); }
  if (!n || n < 1 || n > 100) { if (ack) await ack('Число от 1 до 100', true); else await send(chatId, 'Напиши число от 1 до 100.'); return; }
  if (n < taken(s)) {
    const msg = `Нельзя: уже ${taken(s)} заявок. Сначала убери лишних в «Заявки».`;
    if (ack) return ack(msg, true); else return send(chatId, '⚠️ ' + msg);
  }
  s.seats = n; await slotsSave(slots); await del('state:' + chatId);
  if (ack) await ack('Мест изменено');
  const v = await vSlot(st.slotId);
  if (cq) return edit(cq, v.text, v.kb); else return send(chatId, '✅ Число мест изменено.\n\n' + v.text, v.kb);
}

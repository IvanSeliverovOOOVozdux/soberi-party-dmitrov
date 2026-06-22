// Отдаёт сайту актуальное расписание групповых занятий (из хранилища, которое ведёт бот).
const { getJSON, todayMsk, hasRedis } = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query && req.query.check) { res.status(200).json({ redis: hasRedis() }); return; } // диагностика подключения базы
  try {
    const slots = await getJSON('slots', []);
    const today = todayMsk();
    const list = (Array.isArray(slots) ? slots : [])
      .filter((s) => s && s.date >= today)               // прошедшие даты не показываем
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((s) => ({                                     // наружу — без списка людей, только число занятых
        id: s.id, format: s.format, date: s.date, time: s.time, seats: s.seats,
        taken: Array.isArray(s.bookings) ? s.bookings.length : (s.taken || 0),
      }));
    res.status(200).json(list);
  } catch (e) {
    res.status(200).json([]); // на любой сбой — пусто, сайт покажет «скоро»
  }
};

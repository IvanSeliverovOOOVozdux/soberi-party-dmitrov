// Отдаёт сайту актуальное расписание групповых занятий (из хранилища, которое ведёт бот).
const { getJSON, todayMsk } = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const slots = await getJSON('slots', []);
    const today = todayMsk();
    const list = (Array.isArray(slots) ? slots : [])
      .filter((s) => s && s.date >= today)               // прошедшие даты не показываем
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    res.status(200).json(list);
  } catch (e) {
    res.status(200).json([]); // на любой сбой — пусто, сайт покажет «скоро»
  }
};

// Единый сервер для российского хостинга (Timeweb и т.п.):
// отдаёт статичный сайт + те же API, что работали на Vercel (форма записи, расписание, бот).
// Запуск: npm start  (node server.js). Порт берётся из переменной окружения PORT.
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ── API (те же обработчики, что были на Vercel, без изменений) ──
app.post('/api/book', require('./api/book'));
app.get('/api/schedule', require('./api/schedule'));
app.post('/api/bot', require('./api/bot')); // вебхук Telegram-бота

// ── Статика сайта (index.html, /photo, /brand, /fonts) ──
const STATIC_CACHE = /[\\/](photo|brand|fonts)[\\/]/;
app.use(express.static(__dirname, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (STATIC_CACHE.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // картинки/шрифты — кэш на год
    }
  },
}));

// корень → главная страница
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Soberi Party server запущен на порту ' + PORT));

// Общие помощники для serverless-функций: Redis (Upstash REST), Telegram API, утилиты.

const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || '';
const R_TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || '';
const TOKEN = process.env.BOT_TOKEN || '';

const hasRedis = () => !!(R_URL && R_TOK);

// Upstash REST: POST массив-команду ["GET","key"] → {result: ...}
async function redis(cmd) {
  if (!hasRedis()) throw new Error('redis not configured');
  const r = await fetch(R_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + R_TOK, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j && j.error) throw new Error('redis: ' + j.error);
  return j ? j.result : null;
}

async function getJSON(key, def) {
  try {
    const v = await redis(['GET', key]);
    if (v == null) return def;
    return JSON.parse(v);
  } catch { return def; }
}
async function setJSON(key, val) { return redis(['SET', key, JSON.stringify(val)]); }
async function del(key) { try { return await redis(['DEL', key]); } catch { return null; } }

async function tg(method, payload) {
  const r = await fetch('https://api.telegram.org/bot' + TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  return r.json();
}

// сегодняшняя дата по Москве (UTC+3) в формате YYYY-MM-DD
function todayMsk() { return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10); }

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = { hasRedis, redis, getJSON, setJSON, del, tg, todayMsk, esc };

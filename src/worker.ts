import { Router } from 'itty-router';

const router = Router();

// Konfigurasi global
const REWARD_RATES = {
  like: 2,
  subscribe: 5,
  follow: 3,
  watch: 4
};

const REFERRAL_BONUS = 5;
const TASK_CASHBACK_PERCENT = 10;
const TASK_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 3 hari

// Fungsi utilitas
async function loadJSON(env, key) {
  const val = await env.STORAGE.get(key);
  if (val) return JSON.parse(val);
  if (key === 'tasks.json') return [];
  if (key === 'users.json') return {};
  if (key === 'banned.json') return [];
  return {};
}

async function saveJSON(env, key, data) {
  await env.STORAGE.put(key, JSON.stringify(data));
}

function now() {
  return Date.now();
}

// Handler utama
router.post('/webhook', async (request, env) => {
  const body = await request.json();
  if (!body.message || !body.message.from || !body.message.text) {
    return new Response('Ignored', { status: 200 });
  }

  const msg = body.message;
  const userId = msg.from.id.toString();
  const username = msg.from.username || '';
  const text = msg.text.trim();

  // Load data
  let users = await loadJSON(env, 'users.json');
  let tasks = await loadJSON(env, 'tasks.json');
  let banned = await loadJSON(env, 'banned.json');

  if (banned.includes(userId)) {
    return new Response('Banned', { status: 403 });
  }

  if (!users[userId]) {
    users[userId] = {
      username,
      coin: 10,
      rep: 0,
      joined_at: now(),
      stats: { made: 0, done: 0 },
      ref_by: null
    };
    // Referral dari pesan start
    if (text.startsWith('/start') && text.includes('ref=')) {
      const refId = text.split('ref=')[1].split(' ')[0];
      if (users[refId] && refId !== userId) {
        users[userId].ref_by = refId;
        users[userId].coin += REFERRAL_BONUS;
        users[refId].coin += REFERRAL_BONUS;
      }
    }
    await saveJSON(env, 'users.json', users);
  }

  let reply = '';
  const user = users[userId];

  // Hapus tugas expired
  tasks = tasks.filter(t => t.expires_at > now());

  if (text.startsWith('/buat_tugas')) {
    const [_, jenis, url, jumlahStr] = text.split(' ');
    const jumlah = parseInt(jumlahStr);
    const rate = REWARD_RATES[jenis];

    if (!jenis || !url || isNaN(jumlah) || jumlah < 1 || !rate) {
      reply = `❌ Format salah.\nContoh: /buat_tugas like https://url 5\nJenis: like, subscribe, follow, watch`;
    } else {
      const totalBiaya = jumlah * rate;
      if (user.coin < totalBiaya) {
        reply = `💸 Coin kamu kurang.\nDiperlukan: ${totalBiaya}, Kamu punya: ${user.coin}`;
      } else {
        const task = {
          id: 'task-' + now(),
          type: jenis,
          target: url,
          reward: rate,
          total: jumlah,
          done_by: [],
          created_by: userId,
          created_at: now(),
          expires_at: now() + TASK_EXPIRY_MS
        };
        tasks.push(task);
        user.coin -= totalBiaya;
        user.stats.made += 1;
        await saveJSON(env, 'tasks.json', tasks);
        await saveJSON(env, 'users.json', users);
        reply = `✅ Tugas dibuat: ${task.id}\nJenis: ${jenis}, Jumlah: ${jumlah}\nBiaya: ${totalBiaya} coin`;
      }
    }

  } else if (text === '/daftar_tugas') {
    const list = tasks.filter(t =>
      t.created_by !== userId && !t.done_by.includes(userId) && t.done_by.length < t.total
    );
    reply = list.length === 0
      ? '📭 Tidak ada tugas tersedia.'
      : list.map(t => `🆔 ${t.id}\n📌 ${t.type}\n🔗 ${t.target}\n💰 ${t.reward} coin`).join('\n\n');

  } else if (text.startsWith('/kerjakan')) {
    const taskId = text.split(' ')[1];
    const task = tasks.find(t => t.id === taskId);
    if (!task) reply = '❌ Tugas tidak ditemukan.';
    else if (task.done_by.includes(userId)) reply = '⚠️ Sudah kamu kerjakan.';
    else if (task.done_by.length >= task.total) reply = '⛔ Tugas penuh.';
    else {
      task.done_by.push(userId);
      user.coin += task.reward;
      user.rep += 1;
      user.stats.done += 1;

      // Cashback ke pembuat
      const cashback = Math.floor(task.reward * TASK_CASHBACK_PERCENT / 100);
      if (users[task.created_by]) {
        users[task.created_by].coin += cashback;
      }

      await saveJSON(env, 'tasks.json', tasks);
      await saveJSON(env, 'users.json', users);
      reply = `✅ Kamu kerjakan tugas ${task.id}\n+${task.reward} coin\nReputasi: ${user.rep}`;
    }

  } else if (text === '/cek_coin') {
    reply = `💰 Coin kamu: ${user.coin}\n⭐ Reputasi: ${user.rep}\n📈 Tugas dibuat: ${user.stats.made}\n📉 Tugas dikerjakan: ${user.stats.done}`;

  } else if (text === '/bantuan' || text === '/help' || text === '/start') {
    reply = `🤖 *Bot Tugas Coin - Bantuan*

/buat_tugas jenis url jumlah
/daftar_tugas
/kerjakan task-id
/cek_coin

📌 Jenis tugas:
like: ${REWARD_RATES.like}c
subscribe: ${REWARD_RATES.subscribe}c
follow: ${REWARD_RATES.follow}c
watch: ${REWARD_RATES.watch}c

🎁 Bonus referral:
Ajak teman via:
https://t.me/${env.BOT_USERNAME}?start=ref=${userId}
Kamu & temanmu dapat ${REFERRAL_BONUS} coin!`;

  } else if (text.startsWith('/admin_reset') && userId === env.ADMIN_ID) {
    const [_, who, field] = text.split(' ');
    if (!users[who]) {
      reply = 'User tidak ditemukan.';
    } else {
      users[who][field] = 0;
      await saveJSON(env, 'users.json', users);
      reply = `✅ Field ${field} direset untuk ${who}`;
    }

  } else {
    reply = `❓ Tidak dikenali. Coba /bantuan`;
  }

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: userId,
      text: reply,
      parse_mode: 'Markdown'
    })
  });

  await saveJSON(env, 'tasks.json', tasks); // Update tasks expired
  return new Response('OK');
});

router.all('*', () => new Response('Not Found', { status: 404 }));
export default {
  fetch: router.handle
};

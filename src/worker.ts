import { Router } from 'itty-router';

const router = Router();

async function loadJSON(env, key) {
  const val = await env.STORAGE.get(key);
  return val ? JSON.parse(val) : key === 'tasks.json' ? [] : {};
}

async function saveJSON(env, key, data) {
  await env.STORAGE.put(key, JSON.stringify(data));
}

async function sendMessage(token, payload) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function editMessage(token, payload) {
  return fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

router.post('/webhook', async (request, env) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const msg = body.message || body.callback_query?.message;
  const userId = (body.message?.from.id || body.callback_query?.from.id).toString();
  const text = body.message?.text || body.callback_query?.data || '';

  let users = await loadJSON(env, 'users.json');
  if (!users || typeof users !== 'object') users = {};
  let tasks = await loadJSON(env, 'tasks.json');

  if (!users[userId]) {
    users[userId] = { username: body.message?.from.username || '', coin: 10 };
    await saveJSON(env, 'users.json', users);
  }

  if (text === '/start') {
    await sendMessage(env.BOT_TOKEN, {
      chat_id: userId,
      text: 'Selamat datang! Pilih menu:',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📝 Buat Tugas', callback_data: 'buat_tugas' }],
          [{ text: '📋 Lihat Tugas', callback_data: 'daftar_tugas' }],
          [{ text: '💰 Cek Coin', callback_data: 'cek_coin' }]
        ]
      }
    });
    return new Response('OK');
  }

  // Loading animation first
  const loading = await sendMessage(env.BOT_TOKEN, {
    chat_id: userId,
    text: '⏳ Memproses...',
  });

  const message_id = (await loading.json()).result.message_id;

  let reply = '';
  let markup = undefined;

  if (text === 'cek_coin') {
    reply = `💰 Coin kamu: *${users[userId].coin}*`;
  } else if (text === 'daftar_tugas') {
    const available = tasks.filter(t => !t.done_by.includes(userId) && t.created_by !== userId);
    if (available.length === 0) {
      reply = '📭 Tidak ada tugas tersedia.';
    } else {
      reply = '*📋 Daftar Tugas:*\n\n' + available.map(t =>
        `🆔 ${t.id}\n🔗 ${t.target}\n💰 ${t.reward} coin`
      ).join('\n\n');

      markup = {
        inline_keyboard: available.map(t => [
          { text: `✅ Kerjakan ${t.id}`, callback_data: `kerjakan ${t.id}` }
        ])
      };
    }

  } else if (text.startsWith('kerjakan')) {
    const [_, taskId] = text.split(' ');
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      reply = '❌ Tugas tidak ditemukan.';
    } else if (task.done_by.includes(userId)) {
      reply = '⚠️ Kamu sudah mengerjakan tugas ini.';
    } else {
      task.done_by.push(userId);
      users[userId].coin += task.reward;
      await saveJSON(env, 'tasks.json', tasks);
      await saveJSON(env, 'users.json', users);
      reply = `✅ Tugas *${task.id}* selesai!\nKamu dapat *${task.reward}* coin.`;
    }

  } else if (text === 'buat_tugas') {
    reply = `Untuk membuat tugas, ketik:
*/buat_tugas like https://url 2*`;
  } else if (text.startsWith('/buat_tugas')) {
    const [cmd, jenis, url, rewardStr] = text.split(' ');
    const reward = parseInt(rewardStr);
    if (!url || isNaN(reward)) {
      reply = '❌ Format salah. Contoh:\n/buat_tugas like https://fb.com/post 2';
    } else if (users[userId].coin < reward) {
      reply = `💸 Coin kamu tidak cukup. Coin saat ini: ${users[userId].coin}`;
    } else {
      const id = 'task-' + Date.now();
      tasks.push({ id, type: jenis, target: url, reward, created_by: userId, done_by: [] });
      users[userId].coin -= reward;
      await saveJSON(env, 'tasks.json', tasks);
      await saveJSON(env, 'users.json', users);
      reply = `✅ Tugas berhasil dibuat:\n🆔 ${id}\n🔗 ${url}\n💰 ${reward} coin`;
    }

  } else {
    reply = '🤖 Perintah tidak dikenali. Ketik /start untuk menu.';
  }

  // Edit "⏳ Memproses..." menjadi hasil
  await editMessage(env.BOT_TOKEN, {
    chat_id: userId,
    message_id,
    text: reply,
    parse_mode: 'Markdown',
    reply_markup: markup
  });

  return new Response('OK');
});

router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch: router.handle
};

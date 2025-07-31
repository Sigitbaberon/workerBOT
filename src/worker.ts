import { Router } from 'itty-router';

const router = Router();
const WAIT_SECONDS = 10;

async function loadJSON(env, key) {
  const val = await env.STORAGE.get(key);
  return val ? JSON.parse(val) : key.includes('task-') ? {} : key === 'tasks.json' ? [] : {};
}

async function saveJSON(env, key, data) {
  await env.STORAGE.put(key, JSON.stringify(data));
}

async function sendTelegram(token, method, payload) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function showTyping(token, chat_id) {
  await sendTelegram(token, 'sendChatAction', {
    chat_id,
    action: 'typing',
  });
}

function isValidURL(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

router.post('/webhook', async (request, env) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const isCallback = !!body.callback_query;
  const msg = isCallback ? body.callback_query.message : body.message;
  const userId = (isCallback ? body.callback_query.from.id : msg.from.id).toString();
  const text = isCallback ? body.callback_query.data : msg.text?.trim();

  if (!text) return new Response('No message text');

  let users = await loadJSON(env, 'users.json');
  let tasks = await loadJSON(env, 'tasks.json');

  if (!users[userId]) {
    users[userId] = { username: msg.from?.username || '', coin: 10 };
    await saveJSON(env, 'users.json', users);
  }

  if (text === '/start') {
    await showTyping(env.BOT_TOKEN, userId);
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `👋 Selamat datang *${msg.from.first_name}*!\n\nGunakan tombol-tombol di bawah ini untuk mulai.`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Lihat Tugas', callback_data: 'daftar_tugas' }],
          [{ text: '💰 Cek Coin', callback_data: 'cek_coin' }],
          [{ text: 'ℹ️ Bantuan', callback_data: 'bantuan' }],
        ],
      },
    });
    return new Response('OK');
  }

  // ==== CEK COIN ====
  if (text === 'cek_coin') {
    await showTyping(env.BOT_TOKEN, userId);
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `💰 Coin kamu saat ini: *${users[userId].coin}*`,
      parse_mode: 'Markdown',
    });

  // ==== LIHAT TUGAS ====
  } else if (text === 'daftar_tugas') {
    await showTyping(env.BOT_TOKEN, userId);
    const available = tasks.filter(t => !t.done_by.includes(userId) && t.created_by !== userId);
    if (available.length === 0) {
      await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '📭 Tidak ada tugas yang tersedia untuk kamu saat ini.',
      });
    } else {
      for (const task of available) {
        await saveJSON(env, `task-${task.id}-${userId}`, { visited: Date.now() });
        await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
          chat_id: userId,
          text: `📌 *Tugas Baru*\n\n🆔 ID: \`${task.id}\`\n🎯 Link: [Klik Disini](${task.target})\n💰 Reward: *${task.reward} coin*`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Kunjungi Tugas', url: task.target }],
              [{ text: '✅ Saya sudah kunjungi', callback_data: `klaim_${task.id}` }],
            ],
          },
        });
      }
    }

  // ==== KLAIM TUGAS ====
  } else if (text.startsWith('klaim_')) {
    const taskId = text.split('_')[1];
    const task = tasks.find(t => t.id === taskId);
    const visitKey = `task-${taskId}-${userId}`;
    const visitData = await loadJSON(env, visitKey);
    const now = Date.now();

    await showTyping(env.BOT_TOKEN, userId);

    if (!task) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❌ Tugas tidak ditemukan.',
      });
    }

    if (task.done_by.includes(userId)) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '⚠️ Kamu sudah klaim tugas ini sebelumnya.',
      });
    }

    if (!visitData.visited || now - visitData.visited < WAIT_SECONDS * 1000) {
      const sisa = Math.ceil((WAIT_SECONDS * 1000 - (now - (visitData.visited || 0))) / 1000);
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: `⏳ Tunggu *${sisa} detik* lagi sebelum klaim.`,
        parse_mode: 'Markdown',
      });
    }

    task.done_by.push(userId);
    users[userId].coin += task.reward;
    await saveJSON(env, 'tasks.json', tasks);
    await saveJSON(env, 'users.json', users);

    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `🎉 *Klaim berhasil!*\nKamu mendapatkan *${task.reward} coin*.`,
      parse_mode: 'Markdown',
    });

  // ==== BUAT TUGAS ====
  } else if (text.startsWith('/buat_tugas')) {
    const parts = text.split(' ');
    if (parts.length < 4) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❗ Format salah.\nContoh:\n`/buat_tugas like https://link 5`',
        parse_mode: 'Markdown',
      });
    }

    const [_, jenis, url, rewardStr] = parts;
    const reward = parseInt(rewardStr);

    if (!['like', 'visit'].includes(jenis)) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❗ Jenis tugas tidak valid. Gunakan `like` atau `visit`.',
        parse_mode: 'Markdown',
      });
    }

    if (!isValidURL(url)) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❗ URL tidak valid. Harus diawali http:// atau https://',
      });
    }

    if (isNaN(reward) || reward < 1) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❗ Reward harus berupa angka positif.',
      });
    }

    if (users[userId].coin < reward) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: `❌ Coin kamu tidak cukup. Coin tersedia: *${users[userId].coin}*`,
        parse_mode: 'Markdown',
      });
    }

    const id = 'task-' + Date.now();
    tasks.push({ id, type: jenis, target: url, reward, created_by: userId, done_by: [] });
    users[userId].coin -= reward;

    await saveJSON(env, 'tasks.json', tasks);
    await saveJSON(env, 'users.json', users);

    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `✅ *Tugas berhasil dibuat!*\n\n🆔 ID: \`${id}\`\n🎯 Link: ${url}\n💰 Reward: ${reward} coin`,
      parse_mode: 'Markdown',
    });

  // ==== BANTUAN ====
  } else if (text === 'bantuan') {
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `🆘 *Bantuan Bot*\n\nPerintah:\n/start - Tampilkan menu\n/cek_coin - Lihat saldo coin\n/buat_tugas like <url> <coin> - Buat tugas`,
      parse_mode: 'Markdown',
    });

  } else {
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: '🤖 Perintah tidak dikenali. Gunakan /start untuk membuka menu.',
    });
  }

  return new Response('OK');
});

router.all('*', () => new Response('Not Found', { status: 404 }));

export default { fetch: router.handle };

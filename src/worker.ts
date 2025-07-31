import { Router } from 'itty-router';

const router = Router();
const WAIT_SECONDS = 10;

// === Fungsi Utilitas ===

async function loadJSON(env, key) {
  const val = await env.STORAGE.get(key);
  return val ? JSON.parse(val)
    : key.includes('task-') ? {}
    : key === 'tasks.json' || key === 'user_states.json' ? [] : {};
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
    action: 'typing'
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

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '📋 Lihat Tugas', callback_data: 'daftar_tugas' }],
      [{ text: '➕ Buat Tugas', callback_data: 'buat_tugas_1' }],
      [{ text: '💰 Cek Coin', callback_data: 'cek_coin' }],
      [{ text: 'ℹ️ Bantuan', callback_data: 'bantuan' }]
    ]
  };
}

// === ROUTER ===
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
  const username = msg.from?.username || '';
  const firstName = msg.from?.first_name || '';

  if (!text) return new Response('No message text');

  let users = await loadJSON(env, 'users.json');
  let tasks = await loadJSON(env, 'tasks.json');
  let states = await loadJSON(env, 'user_states.json');

  // Inisialisasi user
  if (!users[userId]) {
    users[userId] = { username, coin: 10 };
    await saveJSON(env, 'users.json', users);
  }

  const state = states[userId] || {};

  // === Handle input link ===
  if (!isCallback && state.step === 'input_link') {
    if (!isValidURL(text)) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❗ URL tidak valid. Kirim ulang link (http:// atau https://)'
      });
    }

    states[userId] = {
      step: 'input_reward',
      type: state.type,
      url: text
    };
    await saveJSON(env, 'user_states.json', states);

    return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: '💰 Pilih reward coin untuk tugas ini:',
      reply_markup: {
        inline_keyboard: [
          [1, 2, 5, 10].map(c => ({
            text: `${c}`, callback_data: `buat_tugas_3_${c}`
          }))
        ]
      }
    });
  }

  // === Handle Callback ===
  await showTyping(env.BOT_TOKEN, userId);

  if (text === '/start' || text === 'menu') {
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `👋 Selamat datang *${firstName}*!`,
      parse_mode: 'Markdown',
      reply_markup: mainMenu()
    });

  } else if (text === 'cek_coin') {
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `💰 Coin kamu: *${users[userId].coin}*`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔄 Menu', callback_data: 'menu' }]] }
    });

  } else if (text === 'daftar_tugas') {
    const available = tasks.filter(t => !t.done_by.includes(userId) && t.created_by !== userId);

    if (available.length === 0) {
      await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '📭 Tidak ada tugas tersedia.',
        reply_markup: { inline_keyboard: [[{ text: '🔄 Menu', callback_data: 'menu' }]] }
      });
    } else {
      for (const task of available) {
        await saveJSON(env, `task-${task.id}-${userId}`, { visited: Date.now() });
        const emoji = task.type === 'like' ? '👍' : '🔗';
        await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
          chat_id: userId,
          text: `📌 *Tugas* 🆔 ${task.id}\n${emoji} ${task.type.toUpperCase()}\n🎯 Kunjungi link\n💰 ${task.reward} coin`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Saya sudah kunjungi', callback_data: `klaim_${task.id}` }],
              [{ text: '🔄 Menu', callback_data: 'menu' }]
            ]
          }
        });
      }
    }

  } else if (text.startsWith('klaim_')) {
    const taskId = text.split('_')[1];
    const task = tasks.find(t => t.id === taskId);
    const visitKey = `task-${taskId}-${userId}`;
    const visitData = await loadJSON(env, visitKey);
    const now = Date.now();

    if (!task) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❌ Tugas tidak ditemukan.'
      });
    }

    if (task.done_by.includes(userId)) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '⚠️ Tugas ini sudah kamu klaim.'
      });
    }

    if (!visitData.visited || now - visitData.visited < WAIT_SECONDS * 1000) {
      const sisa = Math.ceil((WAIT_SECONDS * 1000 - (now - (visitData.visited || 0))) / 1000);
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: `⏳ Tunggu *${sisa} detik* sebelum klaim.`,
        parse_mode: 'Markdown'
      });
    }

    task.done_by.push(userId);
    users[userId].coin += task.reward;
    await saveJSON(env, 'tasks.json', tasks);
    await saveJSON(env, 'users.json', users);

    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `🎉 *Klaim berhasil!*\nKamu mendapat ${task.reward} coin.`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔄 Menu', callback_data: 'menu' }]] }
    });

  } else if (text === 'buat_tugas_1') {
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: '📌 Pilih jenis tugas:',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👍 Like', callback_data: 'buat_tugas_2_like' },
            { text: '🔗 Visit', callback_data: 'buat_tugas_2_visit' }
          ],
          [{ text: '🔄 Menu', callback_data: 'menu' }]
        ]
      }
    });

  } else if (text.startsWith('buat_tugas_2_')) {
    const type = text.split('_')[3];
    states[userId] = { step: 'input_link', type };
    await saveJSON(env, 'user_states.json', states);
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: '🔗 Kirim link target tugas ini:'
    });

  } else if (text.startsWith('buat_tugas_3_')) {
    const reward = parseInt(text.split('_')[3]);
    const info = states[userId];

    if (!info || !info.type || !info.url) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '⚠️ Data tugas tidak lengkap. Ulangi dari awal.'
      });
    }

    if (users[userId].coin < reward) {
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❌ Coin kamu tidak cukup.',
        reply_markup: { inline_keyboard: [[{ text: '🔄 Menu', callback_data: 'menu' }]] }
      });
    }

    const id = Date.now().toString();
    tasks.push({
      id,
      type: info.type,
      target: info.url,
      reward,
      created_by: userId,
      done_by: []
    });
    users[userId].coin -= reward;
    delete states[userId];

    await saveJSON(env, 'tasks.json', tasks);
    await saveJSON(env, 'users.json', users);
    await saveJSON(env, 'user_states.json', states);

    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `✅ *Tugas berhasil dibuat!*\n🆔 ID: ${id}\n🎯 Link: ${info.url}\n💰 Reward: ${reward} coin`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔄 Menu', callback_data: 'menu' }]] }
    });

  } else if (text === 'bantuan') {
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `🆘 *Bantuan*\nGunakan tombol menu untuk navigasi.\n➕ Buat tugas → pilih jenis → kirim link → pilih coin.`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔄 Menu', callback_data: 'menu' }]] }
    });
  }

  return new Response('OK');
});

// Fallback jika tidak ditemukan
router.all('*', () => new Response('Not Found', { status: 404 }));

// Export Worker
export default {
  fetch: router.handle
};

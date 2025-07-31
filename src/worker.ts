import { Router } from 'itty-router';

const router = Router();

// ===== Helper =====

async function loadJSON(env, key) {
  const val = await env.STORAGE.get(key);
  return val ? JSON.parse(val) : key === 'tasks.json' ? [] : {};
}

async function saveJSON(env, key, data) {
  await env.STORAGE.put(key, JSON.stringify(data));
}

async function sendTelegram(token, method, body) {
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// ===== Webhook Handler =====

router.post('/webhook', async (req, env) => {
  const { message } = await req.json();
  if (!message) return new Response('No message');

  const userId = message.from.id;
  const text = message.text?.trim();
  if (!text) return new Response('No text');

  // Ambil data dari KV
  const users = await loadJSON(env, 'users.json');
  const tasks = await loadJSON(env, 'tasks.json');

  // Inisialisasi user
  if (!users[userId]) users[userId] = { coin: 10 };

  // Perintah
  if (text.startsWith('/buat_tugas')) {
    users[userId].state = 'awaiting_type';
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: '📝 Kirim tipe tugas (contoh: subscribe, join, follow)',
    });
  }

  else if (users[userId].state === 'awaiting_type') {
    users[userId].temp = { type: text };
    users[userId].state = 'awaiting_url';
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: '🔗 Kirim URL tujuan tugas (contoh: https://t.me/xxx)',
    });
  }

  else if (users[userId].state === 'awaiting_url') {
    users[userId].temp.url = text;
    users[userId].state = 'awaiting_reward';
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: '💰 Kirim reward tugas (jumlah koin)',
    });
  }

  else if (users[userId].state === 'awaiting_reward') {
    const reward = parseInt(text);
    if (isNaN(reward) || reward <= 0)
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❌ Masukkan angka koin yang valid.',
      });

    if (users[userId].coin < reward)
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❌ Koin kamu tidak cukup untuk membuat tugas ini.',
      });

    // Buat tugas
    const task = {
      id: `task-${Date.now()}`,
      user_id: userId,
      reward,
      info: users[userId].temp
    };

    tasks.push(task);
    users[userId].coin -= reward;
    users[userId].state = null;
    users[userId].temp = null;

    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `✅ Tugas berhasil dibuat!\n\nType: ${task.info.type}\nURL: ${task.info.url}\nReward: ${reward} koin`
    });
  }

  else if (text === '/tugas') {
    const availableTasks = tasks.filter(t => t.user_id !== userId);
    if (availableTasks.length === 0)
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '📭 Belum ada tugas tersedia.',
      });

    const tampil = availableTasks.map(t =>
      `🔹 <b>Type:</b> ${t.info.type}\n🔗 <b>URL:</b> ${t.info.url}\n💰 <b>Reward:</b> ${t.reward} koin\n/task_${t.id}`
    ).join('\n\n');

    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `📋 Daftar Tugas:\n\n${tampil}`,
      parse_mode: 'HTML'
    });
  }

  else if (text.startsWith('/task_task-')) {
    const taskId = text.slice(6);
    const taskIndex = tasks.findIndex(t => t.id === taskId);

    if (taskIndex === -1)
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❌ Tugas sudah diambil atau tidak ditemukan.',
      });

    const task = tasks[taskIndex];
    if (task.user_id === userId)
      return await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
        chat_id: userId,
        text: '❌ Kamu tidak bisa mengambil tugas buatan sendiri.',
      });

    users[userId].coin += task.reward;
    tasks.splice(taskIndex, 1); // hapus tugas

    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `✅ Tugas selesai! Kamu dapat ${task.reward} koin.\n\nURL: ${task.info.url}`
    });
  }

  else if (text === '/coin') {
    await sendTelegram(env.BOT_TOKEN, 'sendMessage', {
      chat_id: userId,
      text: `💰 Koin kamu saat ini: ${users[userId].coin} koin`
    });
  }

  // Simpan kembali semua data
  await saveJSON(env, 'users.json', users);
  await saveJSON(env, 'tasks.json', tasks);

  return new Response('OK');
});

export default {
  fetch: router.handle
};

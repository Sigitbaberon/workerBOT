import { Hono } from 'hono';
import { env } from 'hono/adapter';
import { HTTPException } from 'hono/http-exception';

// Inisialisasi aplikasi Hono
const app = new Hono();

// Helper untuk memuat data dari KV
async function loadJSON(kv, key, defaultValue) {
  const val = await kv.get(key);
  return val ? JSON.parse(val) : defaultValue;
}

// Helper untuk menyimpan data ke KV
async function saveJSON(kv, key, data) {
  await kv.put(key, JSON.stringify(data));
}

// Handler untuk error global
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error('An unexpected error occurred:', err);
  return c.text('Internal Server Error', 500);
});

// Middleware untuk validasi dan parsing body Telegram webhook
app.post('/webhook', async (c, next) => {
  const body = await c.req.json();
  if (!body || !body.message || !body.message.from || !body.message.text) {
    throw new HTTPException(400, { message: 'Invalid Telegram webhook payload.' });
  }
  c.set('telegramMessage', body.message);
  await next();
});

// Route utama untuk webhook Telegram
app.post('/webhook', async (c) => {
  const message = c.get('telegramMessage');
  const userId = message.from.id.toString();
  const text = message.text.trim();
  const username = message.from.username || `user_${userId}`;

  const { STORAGE, BOT_TOKEN } = env(c);

  let users = await loadJSON(STORAGE, 'users.json', {});
  let tasks = await loadJSON(STORAGE, 'tasks.json', []);

  // Inisialisasi user jika belum ada
  if (!users[userId]) {
    users[userId] = { username, coin: 10, created_at: Date.now() };
    await saveJSON(STORAGE, 'users.json', users);
  }

  let reply = '';

  // Penanganan perintah
  if (text.startsWith('/buat_tugas')) {
    reply = await handleCreateTask(userId, text, users, tasks, STORAGE);
  } else if (text.startsWith('/daftar_tugas')) {
    reply = handleListTasks(userId, tasks);
  } else if (text.startsWith('/kerjakan')) {
    reply = await handleCompleteTask(userId, text, users, tasks, STORAGE);
  } else if (text === '/cek_coin') {
    reply = handleCheckCoin(userId, users);
  } else if (text === '/bantuan' || text === '/start') {
    reply = getHelpMessage();
  } else {
    reply = getUnknownCommandMessage();
  }

  // Kirim balasan ke Telegram
  await sendTelegramMessage(BOT_TOKEN, userId, reply);

  return c.text('OK');
});

// Helper functions untuk logika bisnis
async function handleCreateTask(userId, text, users, tasks, STORAGE) {
  const parts = text.split(' ');
  if (parts.length < 4) {
    return 'Format salah. Contoh: `/buat_tugas like https://fb.com/post 2`';
  }

  const [_, type, url, rewardStr] = parts;
  const reward = parseInt(rewardStr);

  if (!['like', 'follow', 'share', 'comment'].includes(type.toLowerCase())) {
    return 'Jenis tugas tidak valid. Gunakan: `like`, `follow`, `share`, `comment`.';
  }

  if (!url || !url.startsWith('http')) {
    return 'URL tidak valid.';
  }

  if (isNaN(reward) || reward <= 0) {
    return 'Reward harus angka positif.';
  }

  if (users[userId].coin < reward) {
    return `Coin kamu tidak cukup. Coin kamu: ${users[userId].coin}`;
  }

  const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  tasks.push({
    id: taskId,
    type: type.toLowerCase(),
    target: url,
    reward,
    created_by: userId,
    done_by: [],
    created_at: Date.now(),
  });

  users[userId].coin -= reward;

  await saveJSON(STORAGE, 'tasks.json', tasks);
  await saveJSON(STORAGE, 'users.json', users);

  return `Tugas *${type}* berhasil dibuat!\n\n` +
         `*ID:* \`${taskId}\`\n` +
         `*Link:* ${url}\n` +
         `*Reward:* ${reward} ðŸ’° coin\n\n` +
         `Coin kamu sekarang: ${users[userId].coin} ðŸ’°`;
}

function handleListTasks(userId, tasks) {
  const available = tasks.filter(
    t => !t.done_by.includes(userId) && t.created_by !== userId
  ).sort((a, b) => b.created_at - a.created_at); // Urutkan dari yang terbaru

  if (available.length === 0) {
    return 'Tidak ada tugas yang tersedia saat ini. Ayo buat tugasmu sendiri!';
  }

  return 'ðŸ“š *Daftar Tugas Tersedia:*\n\n' +
         available.map(t =>
           `ðŸ†” *ID:* \`${t.id}\`\n` +
           `ðŸ”§ *Jenis:* ${t.type.toUpperCase()}\n` +
           `ðŸ”— *Target:* ${t.target}\n` +
           `ðŸ’° *Reward:* ${t.reward} coin`
         ).join('\n\n') +
         '\n\nUntuk mengerjakan, gunakan `/kerjakan <ID_TUGAS>`';
}

async function handleCompleteTask(userId, text, users, tasks, STORAGE) {
  const [_, taskId] = text.split(' ');
  if (!taskId) {
    return 'Format salah. Contoh: `/kerjakan task-id-contoh`';
  }

  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return 'Tugas tidak ditemukan. Pastikan ID tugas benar.';
  }

  const task = tasks[taskIndex];

  if (task.created_by === userId) {
    return 'Kamu tidak bisa mengerjakan tugas yang kamu buat sendiri.';
  }

  if (task.done_by.includes(userId)) {
    return 'Kamu sudah mengerjakan tugas ini sebelumnya.';
  }

  task.done_by.push(userId);
  users[userId].coin += task.reward;

  await saveJSON(STORAGE, 'tasks.json', tasks);
  await saveJSON(STORAGE, 'users.json', users);

  return `Selamat! Kamu berhasil mengerjakan tugas \`${task.id}\`.\n` +
         `Kamu mendapatkan *+${task.reward}* ðŸ’° coin.\n` +
         `Total coin kamu sekarang: ${users[userId].coin} ðŸ’°`;
}

function handleCheckCoin(userId, users) {
  return `Coin kamu saat ini: *${users[userId].coin}* ðŸ’°.`;
}

function getHelpMessage() {
  return `ðŸŒŸ *Selamat datang di Bot Tugas!* ðŸŒŸ\n\n` +
         `Saya akan membantumu mendapatkan coin dengan mengerjakan tugas atau membuat tugas untuk orang lain.\n\n` +
         `*Daftar Perintah:*\n` +
         `ðŸ‘‰ \`/buat_tugas <jenis> <URL> <reward>\`\n` +
         `   _Contoh: /buat_tugas like https://instagram.com/p/123 5_\n` +
         `   _Jenis: \`like\`, \`follow\`, \`share\`, \`comment\`_\n\n` +
         `ðŸ‘‰ \`/daftar_tugas\`\n` +
         `   _Melihat daftar tugas yang bisa kamu kerjakan._\n\n` +
         `ðŸ‘‰ \`/kerjakan <ID_TUGAS>\`\n` +
         `   _Mengerjakan tugas berdasarkan ID-nya._\n\n` +
         `ðŸ‘‰ \`/cek_coin\`\n` +
         `   _Melihat jumlah coin yang kamu miliki._\n\n` +
         `ðŸ‘‰ \`/bantuan\`\n` +
         `   _Menampilkan pesan bantuan ini._\n\n` +
         `Selamat bertugas dan kumpulkan coin sebanyak-banyaknya! ðŸš€`;
}

function getUnknownCommandMessage() {
  return 'Maaf, perintah tidak dikenali. Silakan gunakan `/bantuan` untuk melihat daftar perintah yang tersedia.';
}

// Helper untuk mengirim pesan Telegram
async function sendTelegramMessage(botToken, chatId, text) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown', // Menggunakan Markdown untuk format pesan
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send Telegram message:', errorData);
      // Anda bisa throw error di sini atau menangani secara berbeda
    }
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
  }
}

// Ekspor handler untuk Cloudflare Workers
export default app;
  

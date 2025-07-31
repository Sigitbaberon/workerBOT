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
  await kv.put(kv, JSON.stringify(data));
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
  if (!body) {
    throw new HTTPException(400, { message: 'Invalid Telegram webhook payload.' });
  }

  // Menentukan tipe update (message atau callback_query)
  const isMessage = body.message;
  const isCallbackQuery = body.callback_query;

  let message;
  if (isMessage) {
    message = body.message;
    if (!message.from || (!message.text && !message.sticker && !message.photo)) { // Menambahkan validasi untuk jenis pesan lain jika diperlukan
      throw new HTTPException(400, { message: 'Invalid Telegram message payload.' });
    }
  } else if (isCallbackQuery) {
    message = body.callback_query;
    message.from = body.callback_query.from; // Agar konsisten dengan struktur 'from' di message
    message.text = body.callback_query.data; // Data callback menjadi 'text' untuk penanganan
    message.chat = body.callback_query.message.chat; // Ambil chat info dari message yang terkait
  } else {
    // Abaikan update selain message atau callback_query (misal: edited_message, channel_post, dll.)
    return c.text('OK');
  }

  c.set('telegramUpdateType', isCallbackQuery ? 'callback_query' : 'message');
  c.set('telegramMessage', message);
  c.set('isCallbackQuery', isCallbackQuery); // Flag untuk membedakan
  await next();
});

// Route utama untuk webhook Telegram
app.post('/webhook', async (c) => {
  const message = c.get('telegramMessage');
  const userId = message.from.id.toString();
  const text = message.text ? message.text.trim() : ''; // Pastikan text ada sebelum trim
  const username = message.from.username || `user_${userId}`;
  const isCallbackQuery = c.get('isCallbackQuery');

  const { STORAGE, BOT_TOKEN } = env(c);

  let users = await loadJSON(STORAGE, 'users.json', {});
  let tasks = await loadJSON(STORAGE, 'tasks.json', []);
  let userStates = await loadJSON(STORAGE, 'user_states.json', {}); // Untuk menyimpan state pengguna

  // Inisialisasi user jika belum ada
  if (!users[userId]) {
    users[userId] = { username, coin: 10, created_at: Date.now() };
    await saveJSON(STORAGE, 'users.json', users);
  }

  let replyText = '';
  let replyMarkup = {}; // Objek untuk menyimpan keyboard

  // Mengelola state pengguna
  let currentUserState = userStates[userId] || { step: 'idle', data: {} };

  // --- Logika utama penanganan update ---
  if (isCallbackQuery) {
    // Jika dari tombol inline
    const [command, ...args] = text.split('_');

    if (command === 'menu') {
      replyText = getMainMenuMessage();
      replyMarkup = getMainMenuKeyboard();
      currentUserState = { step: 'idle', data: {} };
    } else if (command === 'buat_tugas') {
      replyText = 'Baik, mari kita buat tugas baru!\n\nJenis tugas apa? (Misal: like, follow, share, comment)';
      currentUserState = { step: 'waiting_for_task_type', data: {} };
    } else if (command === 'daftar_tugas') {
      replyText = await handleListTasks(userId, tasks);
      replyMarkup = getBackButtonKeyboard('menu');
      currentUserState = { step: 'idle', data: {} };
    } else if (command === 'cek_coin') {
      replyText = handleCheckCoin(userId, users);
      replyMarkup = getBackButtonKeyboard('menu');
      currentUserState = { step: 'idle', data: {} };
    } else if (command === 'kerjakan_task') {
        const taskId = args[0]; // Ambil ID tugas dari callback data
        if (taskId) {
            replyText = await handleCompleteTask(userId, `kerjakan ${taskId}`, users, tasks, STORAGE);
            replyMarkup = getBackButtonKeyboard('menu');
            currentUserState = { step: 'idle', data: {} };
        } else {
            replyText = 'ID tugas tidak valid. Silakan coba lagi.';
            replyMarkup = getBackButtonKeyboard('menu');
            currentUserState = { step: 'idle', data: {} };
        }
    } else {
        replyText = 'Perintah tidak dikenali atau kadaluarsa. Kembali ke menu utama.';
        replyMarkup = getMainMenuKeyboard();
        currentUserState = { step: 'idle', data: {} };
    }

    // Untuk callback_query, kita perlu menjawab query-nya agar tombol tidak "loading" terus
    await answerCallbackQuery(BOT_TOKEN, message.id);

  } else {
    // Jika dari pesan teks (termasuk /start dan input user)
    if (text === '/start' || text.toLowerCase() === 'menu') {
      replyText = getMainMenuMessage();
      replyMarkup = getMainMenuKeyboard();
      currentUserState = { step: 'idle', data: {} };
    } else {
      // Penanganan berdasarkan state pengguna
      switch (currentUserState.step) {
        case 'waiting_for_task_type':
          const type = text.toLowerCase();
          if (!['like', 'follow', 'share', 'comment'].includes(type)) {
            replyText = 'Jenis tugas tidak valid. Harap masukkan: `like`, `follow`, `share`, atau `comment`.';
            replyMarkup = getBackButtonKeyboard('buat_tugas'); // Kembali ke langkah awal buat tugas
          } else {
            currentUserState.data.type = type;
            currentUserState.step = 'waiting_for_task_url';
            replyText = `Bagus! Kamu memilih *${type.toUpperCase()}*.\nSekarang kirimkan URL targetnya:`;
            replyMarkup = getBackButtonKeyboard('menu');
          }
          break;

        case 'waiting_for_task_url':
          const url = text;
          if (!url.startsWith('http')) {
            replyText = 'URL tidak valid. Harap masukkan URL yang benar (misal: `https://example.com`).';
            replyMarkup = getBackButtonKeyboard('buat_tugas'); // Kembali ke langkah awal buat tugas
          } else {
            currentUserState.data.url = url;
            currentUserState.step = 'waiting_for_task_reward';
            replyText = `URL sudah diterima. Terakhir, berapa *reward* (coin) untuk tugas ini? (Hanya angka positif)`;
            replyMarkup = getBackButtonKeyboard('menu');
          }
          break;

        case 'waiting_for_task_reward':
          const reward = parseInt(text);
          if (isNaN(reward) || reward <= 0) {
            replyText = 'Reward harus angka positif. Harap masukkan angka yang valid.';
            replyMarkup = getBackButtonKeyboard('buat_tugas'); // Kembali ke langkah awal buat tugas
          } else {
            // Proses pembuatan tugas final
            const createText = `/buat_tugas ${currentUserState.data.type} ${currentUserState.data.url} ${reward}`;
            replyText = await handleCreateTask(userId, createText, users, tasks, STORAGE);
            replyMarkup = getMainMenuKeyboard(); // Kembali ke menu utama
            currentUserState = { step: 'idle', data: {} }; // Reset state
          }
          break;

        default:
          // Jika tidak ada state spesifik atau perintah tidak dikenali
          replyText = getUnknownCommandMessage();
          replyMarkup = getMainMenuKeyboard();
          currentUserState = { step: 'idle', data: {} };
          break;
      }
    }
  }

  // Simpan state pengguna terbaru
  await saveJSON(STORAGE, 'user_states.json', userStates);

  // Kirim balasan ke Telegram
  await sendTelegramMessage(BOT_TOKEN, message.chat.id, replyText, replyMarkup);

  return c.text('OK');
});

// --- Helper functions untuk logika bisnis ---
async function handleCreateTask(userId, text, users, tasks, STORAGE) {
  const parts = text.split(' ');
  // Ini tetap perlu dipertahankan untuk memparsing string yang dibangun dari state
  const [_, type, url, rewardStr] = parts;
  const reward = parseInt(rewardStr);

  if (users[userId].coin < reward) {
    return `Coin kamu tidak cukup. Coin kamu: ${users[userId].coin} ðŸ’°.`;
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
         `Coin kamu sekarang: ${users[userId].coin} ðŸ’°.`;
}

async function handleListTasks(userId, tasks) {
  const available = tasks.filter(
    t => !t.done_by.includes(userId) && t.created_by !== userId
  ).sort((a, b) => b.created_at - a.created_at);

  if (available.length === 0) {
    return 'Tidak ada tugas yang tersedia saat ini. Ayo buat tugasmu sendiri!';
  }

  // Buat inline keyboard untuk setiap tugas yang tersedia
  const taskButtons = available.map(t => [{
    text: `Kerjakan ${t.type.toUpperCase()} | Reward: ${t.reward} ðŸ’°`,
    callback_data: `kerjakan_task_${t.id}` // Data yang akan dikirim saat tombol ditekan
  }]);

  const messageText = 'ðŸ“š *Daftar Tugas Tersedia:*\n\n' +
                      available.map(t =>
                        `ðŸ†” *ID:* \`${t.id}\`\n` +
                        `ðŸ”§ *Jenis:* ${t.type.toUpperCase()}\n` +
                        `ðŸ”— *Target:* ${t.target}\n` +
                        `ðŸ’° *Reward:* ${t.reward} coin`
                      ).join('\n\n') +
                      '\n\nSilakan pilih tugas di bawah:';

  // Menyimpan keyboard untuk ditampilkan bersama pesan
  return {
    text: messageText,
    reply_markup: {
      inline_keyboard: taskButtons
    }
  };
}


async function handleCompleteTask(userId, text, users, tasks, STORAGE) {
  const [_, taskId] = text.split(' ');
  if (!taskId) {
    return 'ID tugas tidak valid. Silakan coba lagi dari daftar tugas.';
  }

  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return 'Tugas tidak ditemukan. Mungkin sudah dihapus atau selesai.';
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
         `Total coin kamu sekarang: ${users[userId].coin} ðŸ’°.`;
}

function handleCheckCoin(userId, users) {
  return `Coin kamu saat ini: *${users[userId].coin}* ðŸ’°.`;
}

// --- Fungsi untuk Keyboard dan Pesan ---
function getMainMenuMessage() {
  return `ðŸŒŸ *Selamat datang di Bot Tugas!* ðŸŒŸ\n\n` +
         `Pilih menu di bawah untuk memulai:`;
}

function getMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'ðŸ“š Daftar Tugas', callback_data: 'daftar_tugas' }],
      [{ text: 'ðŸ“ Membuat Tugas', callback_data: 'buat_tugas' }],
      [{ text: 'ðŸ’° Cek Coin', callback_data: 'cek_coin' }]
    ]
  };
}

function getBackButtonKeyboard(callbackData) {
    return {
        inline_keyboard: [
            [{ text: 'â†— Kembali', callback_data: callbackData }]
        ]
    };
}

function getUnknownCommandMessage() {
  return 'Maaf, perintah tidak dikenali. Silakan gunakan tombol-tombol di bawah atau ketik `/start` untuk kembali ke menu utama.';
}

// Helper untuk mengirim pesan Telegram (diperbarui untuk menangani keyboard)
async function sendTelegramMessage(botToken, chatId, messageContent, replyMarkup = {}) {
  let payload = {
    chat_id: chatId,
    parse_mode: 'Markdown',
  };

  // Jika messageContent adalah objek (dari handleListTasks)
  if (typeof messageContent === 'object' && messageContent !== null && messageContent.text) {
    payload.text = messageContent.text;
    if (messageContent.reply_markup) {
      payload.reply_markup = messageContent.reply_markup;
    }
  } else {
    // Jika messageContent adalah string
    payload.text = messageContent;
    if (Object.keys(replyMarkup).length > 0) { // Hanya tambahkan reply_markup jika ada
        payload.reply_markup = replyMarkup;
    }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send Telegram message:', errorData);
    }
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
  }
}

// Helper untuk menjawab Callback Query (penting agar tombol tidak "loading" terus)
async function answerCallbackQuery(botToken, callbackQueryId, text = '', showAlert = false) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert,
      }),
    });
  } catch (error) {
    console.error('Error answering callback query:', error);
  }
}


// Ekspor handler untuk Cloudflare Workers
export default app;
                             

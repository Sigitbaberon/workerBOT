let users = {};
let tasks = [];
let taskCounter = 1;

export default {
  async fetch(request, env, ctx) {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}`;

    if (request.method !== "POST") return new Response("Bot aktif!");

    const update = await request.json();

    const msg = update.message || update.callback_query?.message;
    const chatId = msg.chat.id.toString();
    const text = update.message?.text || update.callback_query?.data;

    users[chatId] ??= { coin: 10 };

    // Handle /start
    if (text === "/start") {
      const welcome = `👋 Selamat datang!\n💰 Coin kamu: ${users[chatId].coin}`;
      await sendWithButtons(url, chatId, welcome);
    }

    // Handle button callback
    else if (text === "add_task") {
      await sendText(url, chatId, "📝 Kirim tugas dengan format:\n<link> <jenis> <coin>");
      users[chatId].state = "awaiting_task_input";
    }

    else if (text === "get_task") {
      const task = tasks.find(t => !t.done_by.includes(chatId) && t.owner !== chatId);
      if (!task) {
        await sendText(url, chatId, "📭 Tidak ada tugas saat ini.");
      } else {
        await sendText(url, chatId,
`🎯 Tugas Tersedia:
🔗 Link: ${task.link}
📌 Jenis: ${task.type}
💰 Coin: ${task.reward}
🆔 ID: ${task.id}

✅ Jika sudah dikerjakan, tekan tombol "Selesai"`);
        users[chatId].pendingTask = task.id;
      }
    }

    else if (text === "done_task") {
      const id = users[chatId].pendingTask;
      const task = tasks.find(t => t.id === id);
      if (!task) return await sendText(url, chatId, "❌ Tugas tidak ditemukan.");
      if (task.done_by.includes(chatId)) return await sendText(url, chatId, "⚠️ Sudah diselesaikan.");

      task.done_by.push(chatId);
      users[chatId].coin += task.reward;
      await sendText(url, chatId, `🎉 Berhasil! Dapat ${task.reward} coin!\n💰 Total coin: ${users[chatId].coin}`);
    }

    // Handle kiriman manual setelah tekan tambah tugas
    else if (users[chatId].state === "awaiting_task_input") {
      const parts = text.split(" ");
      if (parts.length < 3) {
        await sendText(url, chatId, "❗ Format salah. Gunakan: <link> <jenis> <coin>");
      } else {
        const [link, type, rewardStr] = parts;
        const reward = parseInt(rewardStr);
        if (isNaN(reward) || reward <= 0) {
          await sendText(url, chatId, "❗ Coin reward harus angka positif.");
        } else if (users[chatId].coin < reward) {
          await sendText(url, chatId, "❌ Coin tidak cukup.");
        } else {
          const task = { id: String(taskCounter++), owner: chatId, link, type, reward, done_by: [] };
          tasks.push(task);
          users[chatId].coin -= reward;
          await sendText(url, chatId, `✅ Tugas ditambahkan!\n🔗 ${link}\n💰 Coin: ${reward}\nSisa: ${users[chatId].coin}`);
        }
      }
      users[chatId].state = null;
    }

    return new Response("OK");
  }
};

async function sendWithButtons(url, chatId, text) {
  const buttons = {
    inline_keyboard: [
      [{ text: "➕ Tambah Tugas", callback_data: "add_task" }],
      [{ text: "📋 Ambil Tugas", callback_data: "get_task" }],
      [{ text: "✅ Selesai Tugas", callback_data: "done_task" }]
    ]
  };
  await fetch(`${url}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: buttons }),
  });
}

async function sendText(url, chatId, text) {
  await fetch(`${url}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

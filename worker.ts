let users = {};
let tasks = [];
let taskCounter = 1;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Bot aktif 24 jam.");

    const update = await request.json();
    const msg = update.message;
    const chatId = msg.chat.id.toString();
    const text = msg.text.trim();

    users[chatId] ??= { coin: 10 };

    let reply = "❓ Perintah tidak dikenali.\nGunakan: /add_task <link> <jenis> <coin>";

    if (text === "/start") {
      reply = `👋 Selamat datang!\n💰 Coin kamu: ${users[chatId].coin}\n\nPerintah:\n/add_task\n/get_task\n/done`;
    }

    else if (text.startsWith("/add_task")) {
      const parts = text.split(" ");
      if (parts.length < 4) {
        reply = "❗ Format: /add_task <link> <jenis> <coin>";
      } else {
        const link = parts[1];
        const type = parts[2];
        const reward = parseInt(parts[3]);

        if (isNaN(reward) || reward <= 0) {
          reply = "❗ Coin reward harus angka positif.";
        } else if (users[chatId].coin < reward) {
          reply = "❌ Coin tidak cukup.";
        } else {
          const task = {
            id: String(taskCounter++),
            owner: chatId,
            link,
            type,
            reward,
            done_by: []
          };
          tasks.push(task);
          users[chatId].coin -= reward;
          reply = `✅ Tugas berhasil dibuat!\nLink: ${link}\nReward: ${reward} coin\nSisa coin: ${users[chatId].coin}`;
        }
      }
    }

    else if (text === "/get_task") {
      const task = tasks.find(t => !t.done_by.includes(chatId) && t.owner !== chatId);
      if (!task) {
        reply = "📭 Belum ada tugas yang tersedia.\nTunggu pengguna lain menambahkan tugas.";
      } else {
        reply =
`🎯 Tugas Tersedia:
🔗 Link: ${task.link}
📌 Jenis: ${task.type}
💰 Coin: ${task.reward}
🆔 ID: ${task.id}

✅ Jika sudah dikerjakan, kirim: /done ${task.id}`;
      }
    }

    else if (text.startsWith("/done")) {
      const parts = text.split(" ");
      const id = parts[1];
      const task = tasks.find(t => t.id === id);

      if (!task) {
        reply = "❌ Tugas tidak ditemukan.";
      } else if (task.done_by.includes(chatId)) {
        reply = "⚠️ Kamu sudah menyelesaikan tugas ini.";
      } else {
        task.done_by.push(chatId);
        users[chatId].coin += task.reward;
        reply = `🎉 Sukses! Kamu mendapat ${task.reward} coin!\n💰 Total coin: ${users[chatId].coin}`;
      }
    }

    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });

    return new Response("OK");
  }
};

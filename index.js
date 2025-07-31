export async function fetch(request, env, ctx) {
  const { pathname } = new URL(request.url);

  if (request.method === "POST" && pathname === "/webhook") {
    const update = await request.json();
    const msg = update.message;
    const chatId = msg?.chat?.id;
    const text = msg?.text?.trim() || "";
    const username = msg?.from?.username || `user${chatId}`;

    if (!chatId) return new Response("No chat ID", { status: 200 });

    await ensureWalletExists(env, chatId);

    let reply = "";

    if (text.startsWith("/start")) {
      reply = `👋 Selamat datang @${username} di *RagnetTools Bot*\nGunakan perintah:\n/buat_tugas <link> <coin> <deskripsi>\n/tugas\n/selesai <id>\n/coin`;
    }

    else if (text.startsWith("/buat_tugas")) {
      const args = text.split(" ");
      if (args.length < 4) {
        reply = "❌ Format salah. Contoh: /buat_tugas <link> <coin> <deskripsi>";
      } else {
        const [_, link, coinStr, ...desc] = args;
        const coin = parseInt(coinStr);
        if (isNaN(coin) || coin <= 0) {
          reply = "❌ Coin harus berupa angka positif.";
        } else {
          const balance = await getCoin(env, chatId);
          if (balance < coin) {
            reply = `❌ Coin kamu tidak cukup. Saldo: ${balance}`;
          } else {
            const taskId = `task_${Date.now()}`;
            await env.USERS.put(taskId, JSON.stringify({
              id: taskId,
              from: chatId,
              username,
              link,
              coin,
              desc: desc.join(" "),
              done: false,
              to: null
            }));
            await setCoin(env, chatId, balance - coin);
            reply = `✅ Tugas berhasil dibuat!\n\n🆔 ID: ${taskId}\n🔗 Link: ${link}\n💰 Coin: ${coin}`;
          }
        }
      }
    }

    else if (text === "/tugas") {
      const list = await env.USERS.list({ prefix: "task_" });
      reply = "📝 Daftar Tugas:\n\n";
      for (const k of list.keys) {
        const task = JSON.parse(await env.USERS.get(k.name));
        if (!task.done && task.from !== chatId) {
          reply += `🆔 ${task.id}\n🔗 ${task.link}\n💰 ${task.coin} coin\n📄 ${task.desc}\n\n`;
        }
      }
      if (reply === "📝 Daftar Tugas:\n\n") reply = "📭 Belum ada tugas tersedia untuk kamu.";
    }

    else if (text.startsWith("/selesai")) {
      const args = text.split(" ");
      if (args.length !== 2) {
        reply = "❌ Gunakan format: /selesai <task_id>";
      } else {
        const taskId = args[1];
        const taskStr = await env.USERS.get(taskId);
        if (!taskStr) {
          reply = "❌ Tugas tidak ditemukan.";
        } else {
          const task = JSON.parse(taskStr);
          if (task.done) {
            reply = "⚠️ Tugas sudah diklaim.";
          } else if (task.from === chatId) {
            reply = "⚠️ Kamu tidak bisa menyelesaikan tugasmu sendiri.";
          } else {
            const coinReceiver = await getCoin(env, chatId);
            task.done = true;
            task.to = chatId;
            await env.USERS.put(taskId, JSON.stringify(task));
            await setCoin(env, chatId, coinReceiver + task.coin);
            reply = `🎉 Tugas selesai! Kamu mendapatkan ${task.coin} coin dari @${task.username}`;
          }
        }
      }
    }

    else if (text === "/coin") {
      const balance = await getCoin(env, chatId);
      reply = `💰 Coin kamu: ${balance}`;
    }

    else {
      reply = "🤖 Perintah tidak dikenal. Ketik /start untuk bantuan.";
    }

    await sendMessage(env.BOT_TOKEN, chatId, reply);
    return new Response("OK", { status: 200 });
  }

  return new Response("🤖 RagnetTools Bot Aktif", { status: 200 });
}

async function sendMessage(token, chatId, text) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
  });
}

async function getCoin(env, chatId) {
  const value = await env.USERS.get(`coin_${chatId}`);
  return value ? parseInt(value) : 100;
}

async function setCoin(env, chatId, amount) {
  return env.USERS.put(`coin_${chatId}`, amount.toString());
}

async function ensureWalletExists(env, chatId) {
  const key = `coin_${chatId}`;
  const exists = await env.USERS.get(key);
  if (!exists) {
    await env.USERS.put(key, "100");
  }
        }

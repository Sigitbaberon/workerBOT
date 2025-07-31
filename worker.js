addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// ====== KONFIGURASI ======
const TELEGRAM_TOKEN = "8197335440:AAEY93jyo1P94iJ0rx2xPNb20c6H60BWjvg";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Untuk demo/testing: data hanya hidup selama worker aktif.
// Untuk produksi, GUNAKAN KV Storage Cloudflare!
const users = {}; // { telegram_id: {coins, profile, tasks:[], ...} }
const tasks = {}; // { task_id: {owner, url, reward, type, participants:[] } }

// ====== HELPER UI ======
function getLoadingAnim() {
  const arr = ["⏳", "⚡️", "✨", "🔄", "💫"];
  return arr[Math.floor(Math.random()*arr.length)];
}

function mainMenu(user) {
  return {
    keyboard: [
      [{text: "📝 Ambil Tugas"}, {text: "➕ Buat Tugas"}],
      [{text: "👤 Profil"}, {text: "🏆 Papan Skor"}],
      [{text: "❓ Bantuan"}]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

// ====== HANDLER UTAMA ======
async function handleRequest(request) {
  if (request.method === "POST") {
    const data = await request.json();
    if (data.message) return await onMessage(data.message);
    if (data.callback_query) return await onCallback(data.callback_query);
  }
  return new Response("OK");
}

// ====== HANDLER PESAN (ONMESSAGE) ======
async function onMessage(msg) {
  const chat_id = msg.chat.id;
  const user_id = msg.from.id;
  if (!users[user_id]) users[user_id] = {coins: 10, profile: {}, tasks: []};

  // Start / Menu utama
  if (msg.text === "/start" || msg.text === "🏠 Menu") {
    return sendTelegram("sendMessage", {
      chat_id,
      text: `${getLoadingAnim()} Selamat datang di <b>Ragnet Tools</b>!\n\nDapatkan koin dengan menyelesaikan tugas sosial media atau buat tugas untuk dapat like/follow/share di Facebook.\n\nPilih menu di bawah ini:`,
      parse_mode: "HTML",
      reply_markup: mainMenu(users[user_id])
    });
  }

  if (msg.text === "👤 Profil") return sendProfile(chat_id, user_id);

  if (msg.text === "❓ Bantuan") {
    return sendTelegram("sendMessage", {
      chat_id,
      text: `ℹ️ <b>Cara kerja Ragnet Tools:</b>
1. <b>Kumpulkan koin</b> dengan menyelesaikan tugas (like/follow/share Facebook).
2. <b>Buat tugas</b> dengan link konten Facebook kamu, tentukan reward koin.
3. User lain menyelesaikan tugasmu, kamu dapat like/follow/share sesuai permintaanmu.

<b>Semua sistem peer-to-peer & adil!</b>
${getLoadingAnim()} <i>Menu ada di bawah, klik tombolnya!</i>`,
      parse_mode: "HTML",
      reply_markup: mainMenu(users[user_id])
    });
  }

  if (msg.text === "📝 Ambil Tugas") return sendTaskList(chat_id, user_id);

  if (msg.text === "➕ Buat Tugas") {
    users[user_id].state = "WAIT_LINK";
    return sendTelegram("sendMessage", {
      chat_id,
      text: "📝 Kirim link Facebook (post/profil/page) yang ingin kamu like/follow/share.",
      reply_markup: {keyboard: [[{text: "🏠 Menu"}]], resize_keyboard: true}
    });
  }

  // Step Buat Tugas: Kirim link Facebook
  if (users[user_id].state === "WAIT_LINK" && msg.text.startsWith("http")) {
    users[user_id].temp_link = msg.text;
    users[user_id].state = "WAIT_REWARD";
    return sendTelegram("sendMessage", {
      chat_id,
      text: "💰 Berapa koin per tugas (min 2, max 10)?\n\nMasukkan angka (contoh: 2)",
      reply_markup: {keyboard: [[{text: "2"}, {text: "5"}, {text: "10"}], [{text: "🏠 Menu"}]], resize_keyboard: true}
    });
  }

  // Step Buat Tugas: Kirim reward koin
  if (users[user_id].state === "WAIT_REWARD" && /^\d+$/.test(msg.text)) {
    let reward = parseInt(msg.text, 10);
    if (reward < 2 || reward > 10)
      return sendTelegram("sendMessage", {chat_id, text: "Reward harus antara 2-10 koin"});
    if (users[user_id].coins < reward)
      return sendTelegram("sendMessage", {chat_id, text: "❌ Koin kamu tidak cukup."});
    // Buat tugas
    const task_id = "T" + Date.now();
    tasks[task_id] = {
      owner: user_id,
      url: users[user_id].temp_link,
      reward,
      type: "like_facebook",
      participants: []
    };
    users[user_id].coins -= reward;
    users[user_id].tasks.push(task_id);
    users[user_id].state = "";
    return sendTelegram("sendMessage", {
      chat_id,
      text: `✅ Tugas berhasil dibuat!\n⏩ Link: ${users[user_id].temp_link}\n💸 Koin dipotong: ${reward}\n\nAyo tunggu user lain menyelesaikan tugasmu!`,
      reply_markup: mainMenu(users[user_id])
    });
  }

  if (msg.text === "🏆 Papan Skor") return sendLeaderboard(chat_id);

  // Jika menu tidak dikenali
  return sendTelegram("sendMessage", {
    chat_id,
    text: "Silakan pilih menu di bawah ini.",
    reply_markup: mainMenu(users[user_id])
  });
}

// ====== PROFIL ======
function sendProfile(chat_id, user_id) {
  let user = users[user_id];
  return sendTelegram("sendMessage", {
    chat_id,
    text: `👤 <b>Profil Kamu</b>\n\n🆔 Telegram ID: <code>${user_id}</code>\n💰 Koin: <b>${user.coins}</b>\n\nTugas aktif: <b>${user.tasks.length}</b>`,
    parse_mode: "HTML",
    reply_markup: {inline_keyboard: [[{text:"🏠 Menu", callback_data:"to_menu"}]]}
  });
}

// ====== LIST TUGAS ======
function sendTaskList(chat_id, user_id) {
  let available = Object.entries(tasks)
      .filter(([id, t]) => t.owner !== user_id && !t.participants.includes(user_id))
      .map(([id, t]) => [{text: `👍 Like (${t.reward} koin)`, callback_data: "do_task_"+id}]);

  if (!available.length) {
    return sendTelegram("sendMessage", {
      chat_id,
      text: "Belum ada tugas tersedia.\nKamu bisa membuat tugas baru dengan mengirim link Facebook.",
      reply_markup: {inline_keyboard: [[{text:"🏠 Menu", callback_data:"to_menu"}]]}
    });
  }
  return sendTelegram("sendMessage", {
    chat_id,
    text: `${getLoadingAnim()} <b>Tugas Tersedia:</b>\n\nPilih salah satu untuk mulai!`,
    parse_mode: "HTML",
    reply_markup: {inline_keyboard: [...available, [{text:"🏠 Menu", callback_data:"to_menu"}]]}
  });
}

// ====== LEADERBOARD ======
function sendLeaderboard(chat_id) {
  let top = Object.entries(users)
    .sort((a,b) => b[1].coins - a[1].coins)
    .slice(0, 10)
    .map(([id, u], idx) => `${idx+1}. <code>${id}</code> - <b>${u.coins}</b> koin`).join("\n");
  return sendTelegram("sendMessage", {
    chat_id,
    text: `🏆 <b>Papan Skor Koin</b>\n\n${top || "- Belum ada user -"}\n\n${getLoadingAnim()}`,
    parse_mode: "HTML",
    reply_markup: {inline_keyboard: [[{text:"🏠 Menu", callback_data:"to_menu"}]]}
  });
}

// ====== HANDLER CALLBACK TOMBOL INLINE ======
async function onCallback(cb) {
  const user_id = cb.from.id;
  const chat_id = cb.message.chat.id;
  const data = cb.data;
  if (!users[user_id]) users[user_id] = {coins: 10, profile: {}, tasks: []};

  if (data === "to_menu") return sendTelegram("sendMessage", {
    chat_id,
    text: "Menu utama:",
    reply_markup: mainMenu(users[user_id])
  });

  // Kerjakan tugas
  if (data.startsWith("do_task_")) {
    const task_id = data.replace("do_task_", "");
    const t = tasks[task_id];
    if (!t) return sendTelegram("sendMessage", {chat_id, text: "Tugas tidak ditemukan."});
    if (t.owner === user_id) return sendTelegram("sendMessage", {chat_id, text:"Tidak bisa kerjakan tugas sendiri."});
    if (t.participants.includes(user_id)) return sendTelegram("sendMessage", {chat_id, text:"Sudah kerjakan tugas ini."});
    // Step 1: Arahkan user ke link lalu tombol claim koin
    return sendTelegram("sendMessage", {
      chat_id,
      text: `👍 <b>Like/Follow/Komen/Share Facebook</b>\n\nKlik tombol bawah untuk ke konten user, lalu lakukan aksi, lalu klik "✅ Sudah Selesai" untuk klaim koin!\n\n🔗 <a href="${t.url}">Buka Konten</a>`,
      parse_mode: "HTML",
      reply_markup: {inline_keyboard: [
        [{text:"🔗 Buka Konten", url: t.url}],
        [{text:"✅ Sudah Selesai", callback_data:"done_"+task_id}],
        [{text:"🏠 Menu", callback_data:"to_menu"}]
      ]}
    });
  }
  // Selesai tugas (klaim koin)
  if (data.startsWith("done_")) {
    const task_id = data.replace("done_", "");
    const t = tasks[task_id];
    if (!t) return sendTelegram("sendMessage", {chat_id, text: "Tugas tidak ditemukan."});
    if (t.participants.includes(user_id)) return sendTelegram("sendMessage", {chat_id, text:"Kamu sudah klaim tugas ini."});
    t.participants.push(user_id);
    users[user_id].coins += t.reward;
    return sendTelegram("sendMessage", {
      chat_id,
      text: `🎉 <b>Selamat!</b>\nKoin +${t.reward}!\n\nKoin sekarang: <b>${users[user_id].coins}</b>`,
      parse_mode: "HTML",
      reply_markup: {inline_keyboard: [[{text:"🏠 Menu", callback_data:"to_menu"}]]}
    });
  }

  return new Response("OK");
}

// ====== FUNGSI KIRIM TELEGRAM ======
async function sendTelegram(method, body) {
  await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {"content-type": "application/json"}
  });
  return new Response("OK");
      }

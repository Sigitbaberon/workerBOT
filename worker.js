// Cloudflare Worker Telegram Bot: Ragnet Tools
const TELEGRAM_TOKEN = "8197335440:AAEY93jyo1P94iJ0rx2xPNb20c6H60BWjvg";
const TELEGRAM_API = "https://api.telegram.org/bot" + TELEGRAM_TOKEN;
const BOT_NAME = "Ragnet Tools";
const COIN_START = 10;
const TASK_COST = 2; // coin per like/share/follow
const REWARD = 1; // coin per action

// Storage keys: "profile:{id}", "task:{task_id}", "tasks", "user-tasks:{id}"
// For demo: Use globalThis.DB; In production replace with KV/D1

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === "POST") {
    const update = await request.json();
    if (update.message) {
      return processMessage(update.message);
    }
    if (update.callback_query) {
      return processCallback(update.callback_query);
    }
  }
  return new Response("Ragnet Tools Bot", {status: 200});
}

async function processMessage(msg) {
  const chat_id = msg.chat.id;
  const user_id = msg.from.id.toString();
  // Init profile if not exist
  await ensureProfile(user_id, msg.from);

  if (msg.text === "/start") {
    return sendMenu(chat_id, "👋 Selamat datang di Ragnet Tools!\n\nDapatkan koin dengan menyelesaikan tugas, lalu gunakan koin untuk promosi Facebook Anda.", user_id);
  }
  // Button-only UI
  return sendMenu(chat_id, "🔽 Pilih menu:", user_id);
}

async function processCallback(query) {
  const chat_id = query.message.chat.id;
  const user_id = query.from.id.toString();
  const data = query.data;
  if (data === "profile") {
    const profile = await getProfile(user_id);
    return sendText(chat_id, `👤 Profil Anda\n\nID: <code>${user_id}</code>\nNama: ${profile.name}\nKoin: <b>${profile.coin}</b>`, [
      [{text: "⬅️ Kembali", callback_data: "menu"}]
    ]);
  }
  if (data === "tasks") {
    // List available tasks
    const tasks = await listTasks(user_id);
    if (!tasks.length) return sendText(chat_id, "Belum ada tugas. Coba lagi nanti!", [[{text: "⬅️ Kembali", callback_data: "menu"}]]);
    const keyboard = tasks.map(t => [{text: `💡 ${t.type} | +${REWARD} koin`, callback_data: `do_${t.id}`}]);
    keyboard.push([{text: "⬅️ Kembali", callback_data: "menu"}]);
    return sendText(chat_id, "🎯 Tugas tersedia:", keyboard);
  }
  if (data === "addtask") {
    // Request link and type
    await setUserState(user_id, "await_link");
    return sendText(chat_id, "Kirim link Facebook yang ingin dipromosikan (like/follow/share/komen):", [[{text: "⬅️ Batal", callback_data: "menu"}]]);
  }
  if (data.startsWith("do_")) {
    const task_id = data.slice(3);
    const task = await getTask(task_id);
    if (!task) return sendText(chat_id, "Tugas sudah tidak tersedia.", [[{text: "⬅️ Kembali", callback_data: "tasks"}]]);
    if (task.done.includes(user_id) || task.owner === user_id) return sendText(chat_id, "Anda sudah menyelesaikan tugas ini.", [[{text: "⬅️ Kembali", callback_data: "tasks"}]]);
    // Mark as done, reward, animasi
    await markTaskDone(task_id, user_id);
    await incCoin(user_id, REWARD);
    return sendText(chat_id, `✨ <b>Tugas Selesai!</b>\nSilakan klik link, lakukan aksi, lalu dapatkan koin!`, [
      [{text: "👉 Buka Link", url: task.url}],
      [{text: "⬅️ Kembali", callback_data: "tasks"}]
    ]);
  }
  if (data === "menu") {
    return sendMenu(chat_id, "🔽 Pilih menu:", user_id);
  }
  return sendText(chat_id, "Fitur belum tersedia.", [[{text: "⬅️ Kembali", callback_data: "menu"}]]);
}

async function sendMenu(chat_id, text, user_id) {
  const keyboard = [
    [{text: "🏅 Profil", callback_data: "profile"}],
    [{text: "🎯 Cari Tugas", callback_data: "tasks"}],
    [{text: "➕ Buat Tugas", callback_data: "addtask"}]
  ];
  return sendText(chat_id, text, keyboard);
}

async function sendText(chat_id, text, keyboard) {
  return fetch(TELEGRAM_API + "/sendMessage", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: "HTML",
      reply_markup: {inline_keyboard: keyboard}
    })
  });
}

// --- Profile & State ---
async function ensureProfile(user_id, from) {
  let profile = await getProfile(user_id);
  if (!profile) {
    profile = {id: user_id, name: from.first_name || "Anon", coin: COIN_START};
    await DB.put("profile:" + user_id, JSON.stringify(profile));
  }
}
async function getProfile(user_id) {
  const p = await DB.get("profile:" + user_id);
  return p ? JSON.parse(p) : null;
}
async function incCoin(user_id, amt) {
  const p = await getProfile(user_id);
  p.coin += amt;
  await DB.put("profile:" + user_id, JSON.stringify(p));
}

// --- User state, to capture link for new task ---
async function setUserState(user_id, state) {
  await DB.put("state:" + user_id, state);
}
async function getUserState(user_id) {
  return DB.get("state:" + user_id);
}

// --- Task logic ---
async function listTasks(not_user_id) {
  // For demo, store all tasks in a list
  const tasks_str = await DB.get("tasks") || "[]";
  const tasks = JSON.parse(tasks_str);
  return tasks.filter(t => t.owner !== not_user_id && !t.done.includes(not_user_id) && t.done.length < t.target);
}
async function getTask(task_id) {
  const t = await DB.get("task:" + task_id);
  return t ? JSON.parse(t) : null;
}
async function markTaskDone(task_id, user_id) {
  const task = await getTask(task_id);
  if (!task.done.includes(user_id)) {
    task.done.push(user_id);
    await DB.put("task:" + task_id, JSON.stringify(task));
    // Reward user
    await incCoin(task.owner, -REWARD);
  }
}

// --- Create New Task: To be handled after user sends link in "await_link" state ---
addEventListener('scheduled', event => {
  // Not used for now
});

// --- Key-Value DB (replace with Cloudflare KV or D1) ---
const DB = {
  async get(key) { return globalThis.KV ? globalThis.KV.get(key) : globalThis.localStorage?.getItem(key); },
  async put(key, val) { if (globalThis.KV) return globalThis.KV.put(key, val); return globalThis.localStorage?.setItem(key, val); }
};

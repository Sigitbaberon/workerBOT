export async function fetch(request, env) {
  const apiUrl = (token) => `https://api.telegram.org/bot${token}`;

  async function sendTelegram(token, chat_id, text) {
    return fetch(`${apiUrl(token)}/sendMessage`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({chat_id, text}),
    });
  }
  async function getKV(kv, key, fallback = {}) {
    const val = await kv.get(key);
    return val ? JSON.parse(val) : fallback;
  }
  async function setKV(kv, key, value) {
    await kv.put(key, JSON.stringify(value));
  }
  // USERS KV: key = 'users', value = { user_id: {username, saldo} }
  async function handleStart(env, chat_id, user_id, username) {
    let users = await getKV(env.USERS, "users");
    if(!users[user_id]) {
      users[user_id] = {username, saldo: 0};
      await setKV(env.USERS, "users", users);
    }
    return sendTelegram(env.BOT_TOKEN, chat_id, "Selamat datang di HOT TASK BOT!\n\nGunakan /saldo, /buat_tugas, /cari_tugas, /kerjakan_tugas, /verifikasi_tugas.");
  }
  async function handleSaldo(env, chat_id, user_id) {
    let users = await getKV(env.USERS, "users");
    let saldo = users[user_id]?.saldo || 0;
    return sendTelegram(env.BOT_TOKEN, chat_id, `Saldo koin kamu: ${saldo}`);
  }

  // Perlu TASKS dan SUBMISSIONS KV untuk fitur penuh, contoh hanya USERS
  // Silakan tambahkan sesuai kebutuhan!

  if (request.method === "POST") {
    const data = await request.json();
    const msg = data.message;
    if (!msg) return new Response("No message", {status: 200});
    const user_id = msg.from.id.toString();
    const username = msg.from.username || "";
    const chat_id = msg.chat.id;
    const text = msg.text || "";

    if (text.startsWith("/start")) {
      await handleStart(env, chat_id, user_id, username);
    } else if (text.startsWith("/saldo")) {
      await handleSaldo(env, chat_id, user_id);
    } else {
      await sendTelegram(env.BOT_TOKEN, chat_id, "Perintah tidak dikenali.");
    }
    return new Response("OK", {status: 200});
  }
  return new Response("Telegram Bot Active", {status: 200});
}

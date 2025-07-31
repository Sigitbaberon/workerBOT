const TELEGRAM_TOKEN = "8197335440:AAEY93jyo1P94iJ0rx2xPNb20c6H60BWjvg";
const API_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Key-Value storage (Cloudflare KV example, change to D1/Supabase if needed)
const USERS_KEY = "users";
const TASKS_KEY = "tasks";
const SUBMISSIONS_KEY = "submissions";

async function sendTelegram(chat_id, text) {
  return fetch(`${API_URL}/sendMessage`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({chat_id, text}),
  });
}

// KV helpers
async function getKV(env, key, fallback = {}) {
  const val = await env.BOT_KV.get(key);
  return val ? JSON.parse(val) : fallback;
}
async function setKV(env, key, value) {
  await env.BOT_KV.put(key, JSON.stringify(value));
}

async function handleStart(env, chat_id, user_id, username) {
  let users = await getKV(env, USERS_KEY);
  if(!users[user_id]) {
    users[user_id] = {username, saldo: 0};
    await setKV(env, USERS_KEY, users);
  }
  return sendTelegram(chat_id, "Selamat datang di HOT TASK BOT!\n\nGunakan /saldo, /buat_tugas, /cari_tugas, /kerjakan_tugas, /verifikasi_tugas.");
}

async function handleSaldo(env, chat_id, user_id) {
  let users = await getKV(env, USERS_KEY);
  let saldo = users[user_id]?.saldo || 0;
  return sendTelegram(chat_id, `Saldo koin kamu: ${saldo}`);
}

async function handleBuatTugas(env, chat_id, user_id, username, text) {
  // Format: /buat_tugas|link|instruksi|koin_per_tugas|kuota
  const params = text.split("|");
  if(params.length < 5) {
    return sendTelegram(chat_id, "Format salah!\nFormat: /buat_tugas|link|instruksi|koin_per_tugas|kuota");
  }
  let [_, link, instruksi, koin_per_tugas, kuota] = params;
  koin_per_tugas = parseInt(koin_per_tugas);
  kuota = parseInt(kuota);

  let users = await getKV(env, USERS_KEY);
  if(!users[user_id] || users[user_id].saldo < koin_per_tugas * kuota) {
    return sendTelegram(chat_id, "Saldo koin tidak cukup.");
  }
  let tasks = await getKV(env, TASKS_KEY);
  let task_id = `${Date.now()}${Math.floor(Math.random()*1000)}`;
  tasks[task_id] = {
    task_id,
    owner_id: user_id,
    owner_username: username,
    link,
    instruksi,
    koin_per_tugas,
    kuota,
    sisa_kuota: kuota,
    status: "aktif",
    submissions: []
  };
  users[user_id].saldo -= koin_per_tugas * kuota;
  await setKV(env, TASKS_KEY, tasks);
  await setKV(env, USERS_KEY, users);
  return sendTelegram(chat_id, `Tugas berhasil dibuat!\nID: ${task_id}\nKoin dibekukan: ${koin_per_tugas*kuota}`);
}

async function handleCariTugas(env, chat_id) {
  let tasks = await getKV(env, TASKS_KEY);
  let aktif = Object.values(tasks).filter(t => t.status === "aktif" && t.sisa_kuota > 0);
  if(!aktif.length) return sendTelegram(chat_id, "Belum ada tugas aktif.");
  let msg = "Tugas aktif:\n";
  aktif.forEach(t =>
    msg += `ID: ${t.task_id}\n${t.instruksi}\nLink: ${t.link}\nKoin: ${t.koin_per_tugas}\nSisa: ${t.sisa_kuota}\n\n`
  );
  return sendTelegram(chat_id, msg);
}

async function handleKerjakanTugas(env, chat_id, user_id, text) {
  // Format: /kerjakan_tugas|task_id|bukti
  const params = text.split("|");
  if(params.length < 3) {
    return sendTelegram(chat_id, "Format salah!\nFormat: /kerjakan_tugas|task_id|bukti (link/gambar)");
  }
  let [_, task_id, bukti] = params;
  let tasks = await getKV(env, TASKS_KEY);
  if(!tasks[task_id] || tasks[task_id].status !== "aktif" || tasks[task_id].sisa_kuota === 0) {
    return sendTelegram(chat_id, "Tugas tidak ditemukan atau sudah habis.");
  }
  let submissions = await getKV(env, SUBMISSIONS_KEY);
  let sub_id = `${Date.now()}${Math.floor(Math.random()*1000)}`;
  submissions[sub_id] = {
    sub_id,
    task_id,
    worker_id: user_id,
    bukti,
    status: "pending"
  };
  tasks[task_id].submissions.push(sub_id);
  await setKV(env, SUBMISSIONS_KEY, submissions);
  await setKV(env, TASKS_KEY, tasks);
  // Notify owner
  let owner = tasks[task_id].owner_id;
  await sendTelegram(owner, `Tugas ID ${task_id} ada submission baru dari user ${user_id}.\nBukti: ${bukti}\nGunakan /verifikasi_tugas|${sub_id}|yes atau /verifikasi_tugas|${sub_id}|no`);
  return sendTelegram(chat_id, "Bukti diterima, menunggu verifikasi.");
}

async function handleVerifikasiTugas(env, chat_id, text) {
  // Format: /verifikasi_tugas|submission_id|yes(no)
  const params = text.split("|");
  if(params.length < 3) {
    return sendTelegram(chat_id, "Format salah!\nFormat: /verifikasi_tugas|submission_id|yes|no");
  }
  let [_, sub_id, status] = params;
  let submissions = await getKV(env, SUBMISSIONS_KEY);
  let tasks = await getKV(env, TASKS_KEY);
  let users = await getKV(env, USERS_KEY);

  if(!submissions[sub_id]) return sendTelegram(chat_id, "Submission tidak ditemukan.");
  let {task_id, worker_id} = submissions[sub_id];
  if(status === "yes") {
    submissions[sub_id].status = "approved";
    tasks[task_id].sisa_kuota -= 1;
    let koin = tasks[task_id].koin_per_tugas;
    users[worker_id].saldo = (users[worker_id].saldo || 0) + koin;
    await sendTelegram(worker_id, `Selamat! Submission kamu disetujui, dapat ${koin} koin.`);
    if(tasks[task_id].sisa_kuota === 0) tasks[task_id].status = "selesai";
    await sendTelegram(chat_id, `Submission ${sub_id} sudah disetujui dan koin dikirim ke user ${worker_id}.`);
  } else {
    submissions[sub_id].status = "rejected";
    await sendTelegram(worker_id, `Submission kamu ditolak. Silakan cek instruksi tugas.`);
    await sendTelegram(chat_id, `Submission ${sub_id} ditolak.`);
  }
  await setKV(env, SUBMISSIONS_KEY, submissions);
  await setKV(env, TASKS_KEY, tasks);
  await setKV(env, USERS_KEY, users);
}

export default {
  async fetch(request, env) {
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
      } else if (text.startsWith("/buat_tugas")) {
        await handleBuatTugas(env, chat_id, user_id, username, text);
      } else if (text.startsWith("/cari_tugas")) {
        await handleCariTugas(env, chat_id);
      } else if (text.startsWith("/kerjakan_tugas")) {
        await handleKerjakanTugas(env, chat_id, user_id, text);
      } else if (text.startsWith("/verifikasi_tugas")) {
        await handleVerifikasiTugas(env, chat_id, text);
      } else {
        await sendTelegram(chat_id, "Perintah tidak dikenali.");
      }
      return new Response("OK", {status: 200});
    }
    return new Response("Telegram Bot Active", {status: 200});
  }
}

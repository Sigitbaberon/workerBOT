addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

const users = {};
const tasks = [];
const taskHistory = [];
const dailyClaim = {};

async function handleRequest(request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const userId = params.get("user_id");
  const action = params.get("action");

  if (!users[userId]) {
    users[userId] = { koin: 100, selesai: 0, level: 1, referral: [], rank: 0 };
  }

  if (action === "add_task") {
    const taskLink = params.get("link");
    const koinDipotong = parseInt(params.get("koin")) || 10;
    if (users[userId].koin >= koinDipotong) {
      tasks.push({ id: tasks.length, pemilik: userId, link: taskLink, koin: koinDipotong });
      users[userId].koin -= koinDipotong;
      return new Response("Tugas berhasil ditambahkan");
    } else {
      return new Response("Koin tidak cukup");
    }
  }

  if (action === "kerjakan") {
    const taskId = parseInt(params.get("id"));
    const task = tasks.find(t => t.id === taskId && t.pemilik !== userId);
    if (task) {
      users[userId].koin += task.koin;
      users[userId].selesai += 1;
      users[task.pemilik].koin += 1; // reward pemilik karena tugas selesai
      taskHistory.push({ taskId, oleh: userId, waktu: Date.now() });
      tasks.splice(tasks.indexOf(task), 1);
      return new Response("Tugas selesai, koin bertambah");
    }
    return new Response("Tugas tidak ditemukan atau milik sendiri");
  }

  if (action === "statistik") {
    const u = users[userId];
    return new Response(`📊 Statistik Anda:\n\nKoin: ${u.koin}\nTugas Diselesaikan: ${u.selesai}\nLevel: ${u.level}`);
  }

  if (action === "leaderboard") {
    const ranking = Object.entries(users)
      .sort(([, a], [, b]) => b.koin - a.koin)
      .slice(0, 10)
      .map(([id, u], i) => `${i + 1}. ${id} - ${u.koin} koin`)
      .join("\n");
    return new Response(`🏆 Peringkat:\n\n${ranking}`);
  }

  if (action === "daily") {
    const now = Date.now();
    const last = dailyClaim[userId] || 0;
    if (now - last >= 86400000) {
      users[userId].koin += 20;
      dailyClaim[userId] = now;
      return new Response("🎁 Bonus harian klaim berhasil +20 koin");
    }
    return new Response("Sudah klaim hari ini, coba besok");
  }

  if (action === "referral") {
    const ref = params.get("ref");
    if (ref && ref !== userId && users[ref]) {
      if (!users[ref].referral.includes(userId)) {
        users[ref].referral.push(userId);
        users[ref].koin += 15;
        return new Response("Referral berhasil, user yang direferensi mendapat bonus");
      }
    }
    return new Response("Referral gagal");
  }

  // Daftar tombol utama
  const menu = `
Selamat datang 👋

💰 Koin Anda: ${users[userId].koin}
🛠 Tugas tersedia: ${tasks.length}

🔘 Menu:
- Tambah Tugas: /?action=add_task&user_id=${userId}&link=LINK&koin=10
- Kerjakan Tugas: /?action=kerjakan&user_id=${userId}&id=TASKID
- Statistik: /?action=statistik&user_id=${userId}
- Ranking: /?action=leaderboard&user_id=${userId}
- Bonus Harian: /?action=daily&user_id=${userId}
- Referral: /?action=referral&user_id=${userId}&ref=ID_REF
`;

  return new Response(menu);
}

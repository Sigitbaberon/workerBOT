import { Router } from 'itty-router';

const router = Router();

async function loadJSON(env, key) {
  const val = await env.STORAGE.get(key);
  return val ? JSON.parse(val) : key === 'tasks.json' ? [] : {};
}

async function saveJSON(env, key, data) {
  await env.STORAGE.put(key, JSON.stringify(data));
}

router.post('/webhook', async (request, env) => {
  const body = await request.json();
  const msg = body.message;
  const userId = msg.from.id.toString();
  const text = msg.text || '';

  let users = await loadJSON(env, 'users.json');
  let tasks = await loadJSON(env, 'tasks.json');

  if (!users[userId]) {
    users[userId] = { username: msg.from.username || '', coin: 10 };
    await saveJSON(env, 'users.json', users);
  }

  let reply = '';

  if (text.startsWith('/buat_tugas')) {
    const [cmd, jenis, url, rewardStr] = text.split(' ');
    const reward = parseInt(rewardStr);
    if (!url || isNaN(reward)) {
      reply = 'Format salah. Contoh: /buat_tugas like https://fb.com/post 2';
    } else if (users[userId].coin < reward) {
      reply = `Coin kamu tidak cukup. Coin kamu: ${users[userId].coin}`;
    } else {
      const id = 'task-' + Date.now();
      tasks.push({
        id,
        type: jenis,
        target: url,
        reward,
        created_by: userId,
        done_by: []
      });
      users[userId].coin -= reward;
      await saveJSON(env, 'tasks.json', tasks);
      await saveJSON(env, 'users.json', users);
      reply = `Tugas ${jenis} dibuat!\nID: ${id}\nLink: ${url}\nReward: ${reward} coin`;
    }

  } else if (text.startsWith('/daftar_tugas')) {
    const available = tasks.filter(
      t => !t.done_by.includes(userId) && t.created_by !== userId
    );
    reply = available.length === 0 ? 'Tidak ada tugas.'
      : available.map(t => `🆔 ${t.id}\n🔗 ${t.target}\n💰 ${t.reward} coin`).join('\n\n');

  } else if (text.startsWith('/kerjakan')) {
    const [_, taskId] = text.split(' ');
    const task = tasks.find(t => t.id === taskId);
    if (!task) reply = 'Tugas tidak ditemukan.';
    else if (task.done_by.includes(userId)) reply = 'Sudah dikerjakan.';
    else {
      task.done_by.push(userId);
      users[userId].coin += task.reward;
      await saveJSON(env, 'tasks.json', tasks);
      await saveJSON(env, 'users.json', users);
      reply = `Berhasil kerjakan ${task.id}.\n+${task.reward} coin.`;
    }

  } else if (text === '/cek_coin') {
    reply = `Coin kamu: ${users[userId].coin}`;

  } else {
    reply = `Perintah tidak dikenali.
Gunakan:
/buat_tugas like https://url 1
/daftar_tugas
/kerjakan task-id
/cek_coin`;
  }

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: userId, text: reply })
  });

  return new Response('OK');
});

router.all('*', () => new Response('Not Found', { status: 404 }));
export default { fetch: router.handle };

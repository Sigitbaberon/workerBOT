import { Hono } from 'hono'

const app = new Hono()

async function loadJSON(env: any, key: string) {
  const val = await env.STORAGE.get(key)
  return val ? JSON.parse(val) : key === 'tasks.json' ? [] : {}
}

async function saveJSON(env: any, key: string, data: any) {
  await env.STORAGE.put(key, JSON.stringify(data))
}

async function sendMessage(token: string, chatId: string, text: string, buttons: any[] = []) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined
    })
  })
}

app.post('/webhook', async (c) => {
  const env = c.env
  const body = await c.req.json()
  const msg = body.message
  if (!msg) return c.text('NO MESSAGE')

  const userId = msg.from.id.toString()
  const username = msg.from.username || 'User'

  let users = await loadJSON(env, 'users.json')
  if (!users[userId]) {
    users[userId] = { username, coin: 10 }
    await saveJSON(env, 'users.json', users)
  }

  const buttons = [
    [{ text: '➕ Buat Tugas', callback_data: 'buat_tugas' }],
    [{ text: '📋 Daftar Tugas', callback_data: 'daftar_tugas' }],
    [{ text: '💰 Cek Coin', callback_data: 'cek_coin' }]
  ]

  await sendMessage(env.BOT_TOKEN, userId, `👋 Halo ${username}!\nSilakan pilih menu di bawah:`, buttons)
  return c.text('OK')
})

app.post('/callback', async (c) => {
  const env = c.env
  const body = await c.req.json()
  const cb = body.callback_query
  if (!cb) return c.text('NO CALLBACK')

  const userId = cb.from.id.toString()
  const username = cb.from.username || 'User'
  const data = cb.data

  let users = await loadJSON(env, 'users.json')
  let tasks = await loadJSON(env, 'tasks.json')

  if (!users[userId]) {
    users[userId] = { username, coin: 10 }
    await saveJSON(env, 'users.json', users)
  }

  let reply = ''
  let buttons: any[] = []

  if (data === 'buat_tugas') {
    const reward = 2
    if (users[userId].coin < reward) {
      reply = '❌ Coin kamu tidak cukup untuk membuat tugas.'
    } else {
      const taskId = 'task-' + Date.now()
      const newTask = {
        id: taskId,
        type: 'like',
        target: 'https://example.com/demo-post',
        reward: reward,
        created_by: userId,
        done_by: []
      }
      tasks.push(newTask)
      users[userId].coin -= reward
      await saveJSON(env, 'tasks.json', tasks)
      await saveJSON(env, 'users.json', users)

      reply = `✅ Tugas berhasil dibuat!\n🆔 ID: ${taskId}\n🔗 ${newTask.target}\n💰 Reward: ${reward} coin`
    }
  }

  else if (data === 'daftar_tugas') {
    const available = tasks.filter(t => !t.done_by.includes(userId) && t.created_by !== userId)
    if (available.length === 0) {
      reply = '📭 Tidak ada tugas yang tersedia.'
    } else {
      reply = '📋 Daftar Tugas:\n\n'
      buttons = available.map(t => [{
        text: `🛠 Kerjakan ${t.id}`,
        callback_data: `kerjakan_${t.id}`
      }])
      reply += available.map(t =>
        `🆔 ${t.id}\n🔗 ${t.target}\n💰 ${t.reward} coin\n`
      ).join('\n')
    }
  }

  else if (data.startsWith('kerjakan_')) {
    const taskId = data.replace('kerjakan_', '')
    const task = tasks.find(t => t.id === taskId)

    if (!task) {
      reply = '❌ Tugas tidak ditemukan.'
    } else if (task.done_by.includes(userId)) {
      reply = '⚠️ Tugas ini sudah kamu kerjakan.'
    } else {
      task.done_by.push(userId)
      users[userId].coin += task.reward
      await saveJSON(env, 'tasks.json', tasks)
      await saveJSON(env, 'users.json', users)
      reply = `🎉 Tugas ${task.id} berhasil dikerjakan!\n+${task.reward} coin 💰`
    }
  }

  else if (data === 'cek_coin') {
    reply = `💰 Coin kamu: ${users[userId].coin}`
  }

  await sendMessage(env.BOT_TOKEN, userId, reply, buttons)
  return c.text('OK')
})

app.all('*', c => c.text('404 Not Found', 404))
export default app

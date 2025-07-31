import { Hono } from 'hono'

const app = new Hono()

async function loadJSON(env: any, key: string) {
  const val = await env.STORAGE.get(key)
  return val ? JSON.parse(val) : (key.includes('task-') ? {} : key === 'tasks.json' || key === 'user_states.json' ? [] : {})
}

async function saveJSON(env: any, key: string, data: any) {
  await env.STORAGE.put(key, JSON.stringify(data))
}

app.post('/webhook', async (c) => {
  const env = c.env
  const body = await c.req.json()
  const msg = body.message
  if (!msg) return c.text('NO MESSAGE')

  const userId = msg.from.id.toString()
  const username = msg.from.username || 'Noname'
  const text = msg.text || ''

  let users = await loadJSON(env, 'users.json')
  let tasks = await loadJSON(env, 'tasks.json')

  if (!users[userId]) {
    users[userId] = { username, coin: 10 }
    await saveJSON(env, 'users.json', users)
  }

  let replyText = ''
  let buttons = []

  // START MENU
  if (text === '/start') {
    replyText = `Selamat datang, ${username}!\nGunakan tombol di bawah ini untuk mengakses fitur:`
    buttons = [
      [{ text: '➕ Buat Tugas', callback_data: 'buat_tugas' }],
      [{ text: '📋 Daftar Tugas', callback_data: 'daftar_tugas' }],
      [{ text: '💰 Cek Coin', callback_data: 'cek_coin' }]
    ]
  }

  // JIKA BUKAN /start, TAMPILKAN PESAN DEFAULT
  else {
    replyText = `Gunakan tombol untuk interaksi. Ketik /start untuk memulai.`
    buttons = [
      [{ text: 'Mulai Lagi', callback_data: 'restart' }]
    ]
  }

  // KIRIM PESAN BALASAN
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: userId,
      text: replyText,
      reply_markup: {
        inline_keyboard: buttons
      }
    })
  })

  return c.text('OK')
})

// WEBHOOK UNTUK CALLBACK TOMBOL
app.post('/callback', async (c) => {
  const env = c.env
  const body = await c.req.json()
  const cb = body.callback_query
  if (!cb) return c.text('NO CALLBACK')

  const data = cb.data
  const userId = cb.from.id.toString()
  const username = cb.from.username || 'Noname'

  let users = await loadJSON(env, 'users.json')
  let tasks = await loadJSON(env, 'tasks.json')

  if (!users[userId]) {
    users[userId] = { username, coin: 10 }
    await saveJSON(env, 'users.json', users)
  }

  let replyText = ''
  let buttons = []

  // TOMBOL BUAT TUGAS (SIMPLESATU TUGAS DEMO)
  if (data === 'buat_tugas') {
    const id = 'task-' + Date.now()
    tasks.push({
      id,
      type: 'like',
      target: 'https://example.com/post',
      reward: 2,
      created_by: userId,
      done_by: []
    })
    users[userId].coin -= 2
    await saveJSON(env, 'tasks.json', tasks)
    await saveJSON(env, 'users.json', users)
    replyText = `✅ Tugas dibuat!\nID: ${id}\nLink: https://example.com/post\nReward: 2 coin`
  }

  else if (data === 'daftar_tugas') {
    const available = tasks.filter(t => !t.done_by.includes(userId) && t.created_by !== userId)
    if (available.length === 0) replyText = '📭 Tidak ada tugas tersedia.'
    else {
      replyText = '📋 Daftar Tugas:\n\n'
      buttons = available.map(t => [{ text: `Kerjakan ${t.id}`, callback_data: `kerjakan_${t.id}` }])
      replyText += available.map(t =>
        `🆔 ${t.id}\n🔗 ${t.target}\n💰 ${t.reward} coin\n`
      ).join('\n')
    }
  }

  else if (data.startsWith('kerjakan_')) {
    const taskId = data.replace('kerjakan_', '')
    const task = tasks.find(t => t.id === taskId)
    if (!task) replyText = '❌ Tugas tidak ditemukan.'
    else if (task.done_by.includes(userId)) replyText = '📌 Tugas sudah dikerjakan.'
    else {
      task.done_by.push(userId)
      users[userId].coin += task.reward
      await saveJSON(env, 'tasks.json', tasks)
      await saveJSON(env, 'users.json', users)
      replyText = `🎉 Tugas ${task.id} berhasil dikerjakan!\n+${task.reward} coin`
    }
  }

  else if (data === 'cek_coin') {
    replyText = `💰 Coin kamu: ${users[userId].coin}`
  }

  else if (data === 'restart') {
    replyText = `🔄 Memulai ulang bot...`
    buttons = [
      [{ text: '➕ Buat Tugas', callback_data: 'buat_tugas' }],
      [{ text: '📋 Daftar Tugas', callback_data: 'daftar_tugas' }],
      [{ text: '💰 Cek Coin', callback_data: 'cek_coin' }]
    ]
  }

  // JAWAB CALLBACK DENGAN EDIT MESSAGE
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: cb.from.id,
      text: replyText,
      reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined
    })
  })

  return c.text('OK')
})

app.all('*', (c) => c.text('Not Found', 404))
export default app

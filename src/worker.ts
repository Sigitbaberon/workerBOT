import { Router } from 'itty-router'

const router = Router()

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

// Handle webhook
router.post('/', async (req) => {
  const update = await req.json()
  const msg = update.message || update.callback_query?.message
  const from = msg?.from
  const chatId = from?.id

  if (!chatId) return new Response('Ignored')

  // START command
  if (update.message?.text === '/start') {
    const existing = await USER_DB.get(`users:${chatId}`)
    if (!existing) {
      const user = {
        id: chatId,
        username: from.username || '',
        coins: 100,
        tasks: [],
        completed: []
      }
      await USER_DB.put(`users:${chatId}`, JSON.stringify(user))
    }

    await sendMessage(chatId, `Selamat datang, @${from.username || 'pengguna'}!\n💰 Koin kamu: 100`, [
      [{ text: '🔥 Kerjakan Tugas', callback_data: 'do_task' }],
      [{ text: '📤 Buat Tugas', callback_data: 'create_task' }],
      [{ text: '👤 Profil Saya', callback_data: 'profile' }]
    ])
  }

  // Callback buttons
  if (update.callback_query) {
    const data = update.callback_query.data
    const userRaw = await USER_DB.get(`users:${chatId}`)
    if (!userRaw) return await sendMessage(chatId, "⚠️ Akun tidak ditemukan. Ketik /start")

    const user = JSON.parse(userRaw)

    if (data === 'profile') {
      await sendMessage(chatId, `👤 Profil Anda\n\nID: ${user.id}\nUsername: @${user.username}\n💰 Koin: ${user.coins}`)
    }

    if (data === 'do_task') {
      const allKeys = await TASK_DB.list({ prefix: 'task:' })
      const tasks = []

      for (const key of allKeys.keys) {
        const taskData = await TASK_DB.get(key.name)
        if (taskData) {
          const task = JSON.parse(taskData)
          if (!task.completed_by?.includes(chatId)) {
            tasks.push(task)
          }
        }
      }

      if (tasks.length === 0) {
        return await sendMessage(chatId, "🕐 Belum ada tugas tersedia.")
      }

      const task = tasks[0]
      await sendMessage(chatId,
        `📌 Tugas:\n👉 ${task.type.toUpperCase()}\n🔗 Link: ${task.url}\n🎁 Reward: ${task.reward} koin`,
        [[{ text: '✅ Selesai', callback_data: `complete_${task.id}` }]]
      )
    }

    if (data === 'create_task') {
      await sendMessage(chatId, "📤 Kirim link konten yang ingin ditugaskan:")
      await USER_DB.put(`state:${chatId}`, 'awaiting_link')
    }

    if (data.startsWith('complete_')) {
      const taskId = data.split('_')[1]
      const taskRaw = await TASK_DB.get(`task:${taskId}`)
      if (!taskRaw) return await sendMessage(chatId, "❌ Tugas tidak ditemukan.")

      const task = JSON.parse(taskRaw)
      if (!task.completed_by) task.completed_by = []
      if (!task.completed_by.includes(chatId)) {
        task.completed_by.push(chatId)
        task.remaining -= 1

        user.coins += task.reward
        await USER_DB.put(`users:${chatId}`, JSON.stringify(user))
        await TASK_DB.put(`task:${taskId}`, JSON.stringify(task))

        await sendMessage(chatId, `🎉 Tugas selesai! Kamu dapat ${task.reward} koin.`)
      } else {
        await sendMessage(chatId, "⚠️ Kamu sudah menyelesaikan tugas ini sebelumnya.")
      }
    }
  }

  // Text Input
  if (update.message?.text && !(update.message.text.startsWith('/'))) {
    const input = update.message.text
    const state = await USER_DB.get(`state:${chatId}`)

    if (state === 'awaiting_link') {
      await USER_DB.put(`state:${chatId}`, 'awaiting_type')
      await USER_DB.put(`temp:${chatId}`, JSON.stringify({ url: input }))
      await sendMessage(chatId, "Pilih jenis interaksi:", [
        [
          { text: '👍 Like', callback_data: 'type_like' },
          { text: '👥 Follow', callback_data: 'type_follow' }
        ],
        [
          { text: '💬 Comment', callback_data: 'type_comment' },
          { text: '🔄 Share', callback_data: 'type_share' }
        ]
      ])
    }
  }

  if (update.callback_query?.data?.startsWith('type_')) {
    const type = update.callback_query.data.split('_')[1]
    await USER_DB.put(`state:${chatId}`, 'awaiting_amount')

    const tempRaw = await USER_DB.get(`temp:${chatId}`)
    if (!tempRaw) return await sendMessage(chatId, "⚠️ Link tidak ditemukan.")

    const temp = JSON.parse(tempRaw)
    temp.type = type
    await USER_DB.put(`temp:${chatId}`, JSON.stringify(temp))
    await sendMessage(chatId, `🔢 Masukkan jumlah tugas yang diinginkan:`)
  }

  if (update.message?.text && Number(update.message.text)) {
    const num = Number(update.message.text)
    const state = await USER_DB.get(`state:${chatId}`)

    if (state === 'awaiting_amount') {
      const tempRaw = await USER_DB.get(`temp:${chatId}`)
      const userRaw = await USER_DB.get(`users:${chatId}`)
      if (!tempRaw || !userRaw) return await sendMessage(chatId, "❌ Data tidak lengkap.")

      const taskId = `task:${Date.now()}`
      const task = JSON.parse(tempRaw)
      const user = JSON.parse(userRaw)

      const cost = taskCost(task.type) * num
      if (user.coins < cost) {
        return await sendMessage(chatId, `❌ Koin tidak cukup. Diperlukan ${cost}, kamu punya ${user.coins}.`)
      }

      const fullTask = {
        id: taskId,
        owner: chatId,
        type: task.type,
        url: task.url,
        reward: taskCost(task.type),
        remaining: num,
        completed_by: []
      }

      user.coins -= cost
      await TASK_DB.put(taskId, JSON.stringify(fullTask))
      await USER_DB.put(`users:${chatId}`, JSON.stringify(user))

      await sendMessage(chatId, `✅ Tugas berhasil dibuat! 🔗 ${task.url}\n🎁 Reward per user: ${taskCost(task.type)} koin\n💰 Total dipotong: ${cost} koin`)
      await USER_DB.delete(`temp:${chatId}`)
      await USER_DB.delete(`state:${chatId}`)
    }
  }

  return new Response('OK')
})

function taskCost(type: string): number {
  switch (type) {
    case 'like': return 2
    case 'follow': return 3
    case 'comment': return 5
    case 'share': return 4
    default: return 2
  }
}

async function sendMessage(chatId: number, text: string, buttons: any[][] = []) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined
    })
  })
}

export default {
  fetch: router.handle
}src

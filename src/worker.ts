import { Hono } from 'hono'
import { Bot } from 'grammy'
import type { Context } from 'grammy'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()

const bot = new Bot<Context>(process.env.BOT_TOKEN || '')

// 🛠️ HANDLE WEBHOOK
app.post('/webhook', async (c) => {
  const update = await c.req.json()
  await bot.handleUpdate(update)
  return c.text('OK')
})

// 🚀 START command
bot.command('start', async (ctx) => {
  const id = ctx.from.id.toString()
  const users = await loadJSON(ctx.env, 'users.json')

  if (!users[id]) {
    users[id] = { username: ctx.from.username || '', coin: 10 }
    await saveJSON(ctx.env, 'users.json', users)
  }

  await ctx.reply(`👋 Halo, @${ctx.from.username}!\nSelamat datang di *TaskBot*.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Lihat Tugas', callback_data: 'lihat_tugas' }],
        [{ text: '🪙 Cek Coin', callback_data: 'cek_coin' }],
        [{ text: '➕ Buat Tugas', callback_data: 'buat_tugas' }]
      ]
    }
  })
})

// 🪙 CEK COIN
bot.callbackQuery('cek_coin', async (ctx) => {
  const id = ctx.from.id.toString()
  const users = await loadJSON(ctx.env, 'users.json')
  const coin = users[id]?.coin || 0
  await ctx.answerCallbackQuery()
  await ctx.reply(`💰 Coin kamu: *${coin}*`, { parse_mode: 'Markdown' })
})

// 📝 LIHAT TUGAS
bot.callbackQuery('lihat_tugas', async (ctx) => {
  const id = ctx.from.id.toString()
  const tasks = await loadJSON(ctx.env, 'tasks.json')
  const available = tasks.filter(t => !t.done_by.includes(id) && t.created_by !== id)

  if (available.length === 0) {
    await ctx.reply('🙁 Tidak ada tugas tersedia saat ini.')
    return
  }

  for (const task of available) {
    await ctx.reply(`🆔 *${task.id}*\n🔗 ${task.target}\n🎯 ${task.type}\n💸 ${task.reward} coin`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Kerjakan', callback_data: `kerjakan_${task.id}` }]
        ]
      ]
    })
  }

  await ctx.answerCallbackQuery()
})

// ✅ KERJAKAN TUGAS
bot.callbackQuery(/kerjakan_(.+)/, async (ctx) => {
  const id = ctx.from.id.toString()
  const taskId = ctx.match[1]
  const tasks = await loadJSON(ctx.env, 'tasks.json')
  const users = await loadJSON(ctx.env, 'users.json')

  const task = tasks.find(t => t.id === taskId)

  if (!task) {
    await ctx.reply('❌ Tugas tidak ditemukan.')
  } else if (task.done_by.includes(id)) {
    await ctx.reply('⛔ Kamu sudah mengerjakan tugas ini.')
  } else {
    task.done_by.push(id)
    users[id].coin += task.reward
    await saveJSON(ctx.env, 'tasks.json', tasks)
    await saveJSON(ctx.env, 'users.json', users)
    await ctx.reply(`🎉 Tugas *${task.id}* selesai!\n+${task.reward} coin 💰`, { parse_mode: 'Markdown' })
  }

  await ctx.answerCallbackQuery()
})

// ➕ BUAT TUGAS (trigger awal)
bot.callbackQuery('buat_tugas', async (ctx) => {
  await ctx.reply('✍️ Kirim format tugas seperti ini:\n`like https://link.com 2`', {
    parse_mode: 'Markdown'
  })
  await ctx.answerCallbackQuery()
})

// HANDLE PESAN FORMAT BUAT TUGAS
bot.on('message:text', async (ctx) => {
  const id = ctx.from.id.toString()
  const users = await loadJSON(ctx.env, 'users.json')
  const tasks = await loadJSON(ctx.env, 'tasks.json')

  const [jenis, url, rewardStr] = ctx.message.text.split(' ')
  const reward = parseInt(rewardStr)

  if (!url || isNaN(reward)) return

  if (users[id].coin < reward) {
    await ctx.reply(`❗ Coin tidak cukup. Coin kamu: ${users[id].coin}`)
    return
  }

  const taskId = 'task-' + Date.now()
  tasks.push({ id: taskId, type: jenis, target: url, reward, created_by: id, done_by: [] })
  users[id].coin -= reward

  await saveJSON(ctx.env, 'tasks.json', tasks)
  await saveJSON(ctx.env, 'users.json', users)

  await ctx.reply(`✅ Tugas *${jenis}* berhasil dibuat!\n🔗 ${url}\n💸 ${reward} coin`, {
    parse_mode: 'Markdown'
  })
})

// UTILITY FUNCTIONS
async function loadJSON(env: Env, key: string) {
  const val = await env.STORAGE.get(key)
  return val ? JSON.parse(val) : []
}

async function saveJSON(env: Env, key: string, data: any) {
  await env.STORAGE.put(key, JSON.stringify(data))
}

export default app

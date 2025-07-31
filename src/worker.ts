import { Router } from 'itty-router'

const router = Router()

// Waktu tunggu tugas (dalam detik)
const WAIT_SECONDS = 10

// Helper untuk ambil data JSON dari KV
async function loadJSON(env, key) {
  const val = await env.STORAGE.get(key)
  return val ? JSON.parse(val) : key.startsWith('task-') ? {} : []
}

// Helper untuk simpan data JSON ke KV
async function saveJSON(env, key, data) {
  await env.STORAGE.put(key, JSON.stringify(data))
}

// ⛳ Webhook Handler
router.post("/webhook", async (request, env) => {
  const update = await request.json()
  const msg = update.message
  if (!msg || !msg.text) return new Response("OK")

  const chatId = msg.chat.id
  const text = msg.text.trim()
  const userId = String(chatId)

  // Load data user
  let userStates = await loadJSON(env, 'user_states.json')
  let user = userStates.find(u => u.id === userId)

  if (!user) {
    user = { id: userId, koin: 0, state: 'idle' }
    userStates.push(user)
    await saveJSON(env, 'user_states.json', userStates)
  }

  // Handle perintah
  if (text === '/start') {
    await sendMessage(env, chatId, `Selamat datang! Kamu punya ${user.koin} koin.`)
    return new Response("OK")
  }

  if (text === '/koin') {
    await sendMessage(env, chatId, `Saldo kamu: ${user.koin} koin`)
    return new Response("OK")
  }

  if (text === '/tugas') {
    // Cek apakah user sedang menunggu tugas
    if (user.state === 'waiting') {
      await sendMessage(env, chatId, `Kamu sedang menunggu tugas...`)
      return new Response("OK")
    }

    // Buat tugas baru
    user.state = 'waiting'
    await saveJSON(env, 'user_states.json', userStates)

    // Simulasikan penundaan tugas (nanti diganti real logic)
    setTimeout(async () => {
      const tugas = {
        id: `tugas-${Date.now()}`,
        userId: userId,
        deskripsi: "Tugas klik tombol, nanti kamu dapat 1 koin",
        waktu: new Date().toISOString()
      }

      await env.STORAGE.put(`task-${userId}`, JSON.stringify(tugas))

      // Kirim tugas ke user
      await sendMessage(env, chatId, `Tugas baru:\n${tugas.deskripsi}`)

      // Reset status
      user.state = 'idle'
      await saveJSON(env, 'user_states.json', userStates)
    }, WAIT_SECONDS * 1000)

    await sendMessage(env, chatId, `Sedang mencari tugas... tunggu ${WAIT_SECONDS} detik.`)
    return new Response("OK")
  }

  if (text === '/ambil') {
    const tugas = await loadJSON(env, `task-${userId}`)

    if (!tugas.id) {
      await sendMessage(env, chatId, `Belum ada tugas untuk kamu.`)
      return new Response("OK")
    }

    // Tambah koin
    user.koin += 1
    await env.STORAGE.delete(`task-${userId}`)
    await saveJSON(env, 'user_states.json', userStates)

    await sendMessage(env, chatId, `Tugas selesai! Kamu dapat 1 koin.\nTotal koin: ${user.koin}`)
    return new Response("OK")
  }

  // Tidak dikenal
  await sendMessage(env, chatId, `Perintah tidak dikenali.`)
  return new Response("OK")
})

// Fungsi kirim pesan
async function sendMessage(env, chatId, text) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  })
}

// ⛳ Default router fallback
router.all("*", () => new Response("404 Not Found", { status: 404 }))

export default {
  fetch: (req, env, ctx) => router.handle(req, env, ctx),
      }

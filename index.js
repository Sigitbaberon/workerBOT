addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const taskTypes = {
  like: { cost: 2, reward: 1 },
  follow: { cost: 4, reward: 2 },
  comment: { cost: 6, reward: 3 },
  share: { cost: 5, reward: 2.5 }
}

async function handleRequest(request) {
  if (request.method !== "POST") return new Response("OK")

  const update = await request.json()

  if (update.message) {
    const chatId = update.message.chat.id
    const userId = String(chatId)
    const text = update.message.text.toLowerCase()

    let user = await USERS.get(userId, { type: 'json' }) || { coins: 10, tasks: [] }

    // Jika kirim link tugas
    if (text.startsWith("http")) {
      user.lastLink = text
      await USERS.put(userId, JSON.stringify(user))
      return sendMessage(chatId, `📌 Link tersimpan.\nPilih jenis tugas:`, typeKeyboard())
    }

    // Menu awal
    if (text === "/start") {
      await USERS.put(userId, JSON.stringify(user))
      return sendMessage(chatId, `👋 Selamat datang di *Ragnet Tools*!\n\n🔁 Sistem tugas like/follow/share Facebook\n💰 Kamu dapat koin dari menyelesaikan tugas.\n\nPilih menu:`, mainKeyboard())
    }

    return sendMessage(chatId, `🤖 Silakan gunakan tombol di bawah.`, mainKeyboard())
  }

  // Callback tombol ditekan
  if (update.callback_query) {
    const data = update.callback_query.data
    const chatId = update.callback_query.message.chat.id
    const userId = String(chatId)
    let user = await USERS.get(userId, { type: 'json' }) || { coins: 10, tasks: [] }

    if (data === "profile") {
      return sendMessage(chatId, `🧑‍💼 ID: ${chatId}\n💰 Koin: ${user.coins}`, mainKeyboard())
    }

    if (data === "buat") {
      return sendMessage(chatId, `🔗 Kirimkan link Facebook kamu dulu.\nSetelah itu kamu akan pilih jenis tugas.`)
    }

    if (data === "ambil") {
      const users = await USERS.list()
      let tugas = []

      for (const key of users.keys) {
        const u = await USERS.get(key.name, { type: "json" })
        if (u?.tasks?.length > 0) {
          tugas.push(...u.tasks.map(t => `✅ ${t.type.toUpperCase()} - [Klik Tugas](${t.url}) → 🎁 +${t.reward} koin`))
        }
      }

      return sendMessage(chatId, tugas.length ? tugas.join('\n\n') : '📭 Belum ada tugas.', mainKeyboard(), true)
    }

    // Saat user pilih jenis tugas
    if (data.startsWith("task:")) {
      const type = data.split(":")[1]
      const link = user.lastLink
      const setting = taskTypes[type]

      if (!link) return sendMessage(chatId, `⛔ Kirim link Facebook dulu.`)

      if (user.coins < setting.cost)
        return sendMessage(chatId, `❌ Koin kamu tidak cukup.\n💰 Perlu ${setting.cost}, kamu punya ${user.coins}`)

      // Simpan tugas dan potong koin
      user.tasks.push({ type, url: link, reward: setting.reward })
      user.coins -= setting.cost
      delete user.lastLink
      await USERS.put(userId, JSON.stringify(user))

      return sendMessage(chatId, `✅ Tugas berhasil dibuat!\n🔗 ${type.toUpperCase()} → ${link}\n💸 -${setting.cost} koin`, mainKeyboard())
    }
  }

  return new Response("OK")
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Profil", callback_data: "profile" }],
      [{ text: "📥 Buat Tugas", callback_data: "buat" }],
      [{ text: "📋 Ambil Tugas", callback_data: "ambil" }]
    ]
  }
}

function typeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👍 Like", callback_data: "task:like" }],
      [{ text: "➕ Follow", callback_data: "task:follow" }],
      [{ text: "💬 Komentar", callback_data: "task:comment" }],
      [{ text: "🔁 Share", callback_data: "task:share" }]
    ]
  }
}

async function sendMessage(chatId, text, keyboard = null, markdown = false) {
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: markdown ? "Markdown" : "HTML",
    reply_markup: keyboard
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
      }

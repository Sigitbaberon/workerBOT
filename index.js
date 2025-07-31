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
    const msg = update.message
    const chatId = msg.chat.id
    const userId = String(chatId)
    const text = msg.text?.toLowerCase()?.trim() || ""

    let user = await USERS.get(userId, { type: 'json' }) || { coins: 10, tasks: [] }

    // Menu /start
    if (text === "/start") {
      await USERS.put(userId, JSON.stringify(user))
      return sendMessage(chatId,
        `👋 Selamat datang di *Ragnet Tools*!\n\n🔁 Sistem tugas like/follow/share Facebook\n💰 Dapatkan koin dari menyelesaikan tugas.\n\nPilih menu:`,
        mainKeyboard())
    }

    // Kirim link Facebook
    if (text.startsWith("http")) {
      if (!/^https?:\/\/(www\.)?facebook\.com/.test(text)) {
        return sendMessage(chatId, `⛔ Link harus dari Facebook.`)
      }

      user.lastLink = text
      await USERS.put(userId, JSON.stringify(user))
      return sendMessage(chatId, `📌 Link tersimpan.\nPilih jenis tugas:`, typeKeyboard())
    }

    return sendMessage(chatId, `🤖 Silakan gunakan tombol di bawah.`, mainKeyboard())
  }

  if (update.callback_query) {
    const data = update.callback_query.data
    const chatId = update.callback_query.message.chat.id
    const userId = String(chatId)
    let user = await USERS.get(userId, { type: 'json' }) || { coins: 10, tasks: [] }

    if (data === "profile") {
      return sendMessage(chatId,
        `🧑‍💼 ID: ${chatId}\n💰 Koin: ${user.coins}\n📝 Total Tugas: ${user.tasks.length}`,
        mainKeyboard())
    }

    if (data === "buat") {
      return sendMessage(chatId, `🔗 Kirimkan link Facebook kamu dulu.\nSetelah itu pilih jenis tugas.`)
    }

    if (data === "ambil") {
      const users = await USERS.list()
      let tugas = []

      for (const key of users.keys) {
        const u = await USERS.get(key.name, { type: "json" })
        if (u?.tasks?.length > 0) {
          tugas.push(...u.tasks.map(t =>
            `✅ ${t.type.toUpperCase()} - [Klik Tugas](${t.url}) → 🎁 +${t.reward} koin`
          ))
        }
      }

      return sendMessage(chatId,
        tugas.length ? tugas.join('\n\n') : '📭 Belum ada tugas.',
        mainKeyboard(), true)
    }

    if (data.startsWith("task:")) {
      const type = data.split(":")[1]
      const setting = taskTypes[type]
      const link = user.lastLink

      if (!setting) return sendMessage(chatId, "⛔ Jenis tugas tidak dikenal.")
      if (!link) return sendMessage(chatId, "📎 Kirimkan link Facebook dulu.")
      if (user.coins < setting.cost) {
        return sendMessage(chatId,
          `❌ Koin kamu tidak cukup.\n💰 Perlu ${setting.cost}, kamu punya ${user.coins}`)
      }

      // Cegah duplikat
      if (user.tasks.find(t => t.url === link && t.type === type)) {
        return sendMessage(chatId, "⚠️ Tugas ini sudah pernah kamu buat.")
      }

      // Maks 10 tugas
      if (user.tasks.length >= 10) {
        return sendMessage(chatId, "🚫 Maksimal 10 tugas aktif per pengguna.")
      }

      // Simpan tugas
      user.tasks.push({
        id: crypto.randomUUID(),
        type,
        url: link,
        reward: setting.reward
      })
      user.coins -= setting.cost
      delete user.lastLink
      await USERS.put(userId, JSON.stringify(user))

      return sendMessage(chatId,
        `✅ Tugas berhasil dibuat!\n🔗 ${type.toUpperCase()} → ${link}\n💸 -${setting.cost} koin`,
        mainKeyboard())
    }
  }

  return new Response("OK")
}

// ======================== UI
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

// ======================== SEND MESSAGE
async function sendMessage(chatId, text, keyboard = null, markdown = false) {
  const body = {
    chat_id: chatId,
    text,
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

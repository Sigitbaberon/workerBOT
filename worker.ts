export default {
  async fetch(req: Request, env: any): Promise<Response> {
    const url = new URL(req.url)
    if (req.method !== 'POST' || !url.pathname.startsWith("/webhook")) {
      return new Response("Only Telegram Webhook POST supported", { status: 400 });
    }

    const body = await req.json()
    const msg = body.message || body.callback_query?.message
    const chat_id = msg?.chat?.id
    const user_id = body.message?.from?.id || body.callback_query?.from?.id
    const username = body.message?.from?.username || body.callback_query?.from?.username

    // Default response if nothing matched
    const reply = async (text: string, options = {}) =>
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text,
          parse_mode: "Markdown",
          ...options,
        }),
      })

    // Handle start
    if (body.message?.text === "/start") {
      const userKey = `user:${user_id}`
      const exists = await env.DB.get(userKey)
      if (!exists) await env.DB.put(userKey, JSON.stringify({ coins: 10, username }))
      return reply(`Selamat datang, @${username || "anon"}! 🎉\n\nKamu mendapat 10 coin pertama!\nGunakan tombol-tombol di bawah ini:`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 Cek Coin", callback_data: "cek_coin" }],
            [{ text: "📢 Info", callback_data: "info" }],
            [{ text: "👥 Grup Telegram", url: "https://t.me/yourgroup" }]
          ]
        }
      })
    }

    // Handle tombol
    if (body.callback_query) {
      const data = body.callback_query.data
      const userKey = `user:${user_id}`
      const userRaw = await env.DB.get(userKey)
      const userData = userRaw ? JSON.parse(userRaw) : { coins: 0 }

      if (data === "cek_coin") {
        return reply(`Kamu punya *${userData.coins}* coin 💰`, {
          reply_to_message_id: msg.message_id
        })
      }

      if (data === "info") {
        return reply(`📢 *Tentang Bot Ini*\n\n- Dapatkan coin dengan promosi\n- Gunakan coin untuk akses premium\n\nKontak: @YourAdmin`, {
          reply_to_message_id: msg.message_id
        })
      }
    }

    return new Response("OK")
  }
}

import { handleUpdate, sendMessage, setWebhook, getUserCoins, addCoin } from './bot';
import { Router } from 'itty-router';

const TELEGRAM_TOKEN = TELEGRAM_TOKEN_ENV; // Diatur lewat Wrangler.toml vars
const router = Router();

router.post(`/bot${TELEGRAM_TOKEN}`, async (req) => {
  const update = await req.json();
  return await handleUpdate(update);
});

router.get("/", () => new Response("Bot Coin Like aktif!", { status: 200 }));

addEventListener("fetch", (event) => {
  event.respondWith(router.handle(event.request));
});

// Bot logic
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

export async function handleUpdate(update: any) {
  const msg = update.message || update.callback_query?.message;
  const chatId = msg.chat.id;
  const userId = update.message?.from?.id || update.callback_query?.from?.id;

  if (update.message?.text === "/start") {
    await sendMessage(chatId, `Selamat datang! Gunakan tombol di bawah untuk mulai.`, [
      [{ text: "💰 Cek Koin", callback_data: "cek_coin" }],
      [{ text: "➕ Tambah Koin", callback_data: "tambah_coin" }]
    ]);
    return new Response("OK");
  }

  if (update.callback_query) {
    const data = update.callback_query.data;
    if (data === "cek_coin") {
      const coins = await getUserCoins(userId);
      await sendMessage(chatId, `🔎 Kamu punya ${coins} koin.`);
    } else if (data === "tambah_coin") {
      const newCoins = await addCoin(userId, 1);
      await sendMessage(chatId, `✅ Koin berhasil ditambahkan! Total: ${newCoins} koin.`);
    }
    return new Response("OK");
  }

  return new Response("Ignored", { status: 200 });
}

export async function sendMessage(chatId: number, text: string, buttons: any = null) {
  const body: any = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };

  if (buttons) {
    body.reply_markup = {
      inline_keyboard: buttons
    };
  }

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function getUserCoins(userId: number) {
  const key = `coin_${userId}`;
  const value = await COIN_KV.get(key);
  return parseInt(value || "0");
}

export async function addCoin(userId: number, amount: number) {
  const key = `coin_${userId}`;
  const current = await getUserCoins(userId);
  const total = current + amount;
  await COIN_KV.put(key, total.toString());
  return total;
}

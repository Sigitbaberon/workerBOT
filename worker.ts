import { TelegramBot } from "grammy";
import { Hono } from "hono";
import { env } from "hono/adapter";
import { z } from "zod";

type Env = {
  BOT_TOKEN: string;
  DB: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

app.post("/", async (c) => {
  const { BOT_TOKEN, DB } = env(c);
  const body = await c.req.json();

  const bot = new TelegramBot(BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const userId = String(ctx.from.id);
    await DB.prepare("INSERT OR IGNORE INTO users (id, coins) VALUES (?, 0)").bind(userId).run();

    await ctx.reply("Selamat datang di Facebook Task Bot!", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💰 Koin Saya", callback_data: "my_coins" }],
          [{ text: "➕ Buat Tugas", callback_data: "create_task" }],
          [{ text: "📋 Kerjakan Tugas", callback_data: "do_task" }],
        ],
      },
    });
  });

  bot.callbackQuery("my_coins", async (ctx) => {
    const userId = String(ctx.from.id);
    const res = await DB.prepare("SELECT coins FROM users WHERE id = ?").bind(userId).first();
    await ctx.answerCallbackQuery();
    await ctx.reply(`💰 Koin kamu: ${res?.coins || 0}`);
  });

  bot.callbackQuery("create_task", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Kirimkan link tugasmu (Facebook Like/Share/Follow). Format: `tipe|url|jumlah|koin_per_aksi`\n\nContoh: `like|https://facebook.com/xxx|10|1`", {
      parse_mode: "Markdown",
    });
  });

  bot.on("message:text", async (ctx) => {
    const userId = String(ctx.from.id);
    const text = ctx.message.text || "";

    if (text.includes("|")) {
      const parts = text.split("|");
      if (parts.length !== 4) return ctx.reply("Format salah. Coba lagi.");

      const [type, url, totalStr, rewardStr] = parts;
      const total = parseInt(totalStr);
      const reward = parseInt(rewardStr);
      const cost = total * reward;

      const res = await DB.prepare("SELECT coins FROM users WHERE id = ?").bind(userId).first();
      const coins = res?.coins || 0;

      if (coins < cost) return ctx.reply("❌ Koin kamu tidak cukup.");

      await DB.prepare("UPDATE users SET coins = coins - ? WHERE id = ?").bind(cost, userId).run();
      await DB.prepare("INSERT INTO tasks (owner_id, url, type, reward, total) VALUES (?, ?, ?, ?, ?)")
        .bind(userId, url, type, reward, total).run();

      await ctx.reply("✅ Tugas berhasil dibuat!");
    }
  });

  bot.callbackQuery("do_task", async (ctx) => {
    const userId = String(ctx.from.id);

    const res = await DB.prepare("SELECT * FROM tasks WHERE total > 0 AND instr(json_array_to_list(done_by), ?) = 0 LIMIT 1").bind(userId).first();
    if (!res) return ctx.reply("Tidak ada tugas yang tersedia.");

    await ctx.answerCallbackQuery();
    await ctx.reply(`➡️ Ayo ${res.type} link ini: ${res.url}`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Sudah Selesai", callback_data: `done_task:${res.id}` },
        ]],
      },
    });
  });

  bot.callbackQuery(/^done_task:(\d+)$/, async (ctx) => {
    const userId = String(ctx.from.id);
    const taskId = ctx.match![1];

    // Update task
    await DB.prepare(`UPDATE tasks SET total = total - 1, done_by = json_array_append(done_by, ?) WHERE id = ?`)
      .bind(userId, taskId).run();

    await DB.prepare("UPDATE users SET coins = coins + (SELECT reward FROM tasks WHERE id = ?) WHERE id = ?")
      .bind(taskId, userId).run();

    await ctx.answerCallbackQuery("Kamu mendapatkan koin!");
    await ctx.reply("🎉 Terima kasih, tugas selesai. Koin telah ditambahkan.");
  });

  await bot.handleUpdate(body);
  return c.text("OK");
});

export default app;

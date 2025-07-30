export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const update = await request.json();
      const message = update?.message?.text;
      const chat_id = update?.message?.chat?.id;

      if (!message || !chat_id) {
        return new Response("Invalid message", { status: 400 });
      }

      // API KEY GEMINI
      const GEMINI_API_KEY = "AIzaSyDHYnj-E0V0h16thBf_-mycv4OnaKRxfgM";

      // Kirim ke Google Gemini
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: message }] }],
          }),
        }
      );

      const geminiJson = await geminiRes.json();
      console.log("Gemini response:", JSON.stringify(geminiJson));

      const replyText =
        geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "[!] Gemini gagal merespons dengan benar.";

      // Kirim ke Telegram
      const TELEGRAM_BOT_TOKEN = "7341627486:AAFd7TdIjxVdSx3lfkrhgAZpB2VMMU0WjuI";
      const telegramURL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

      await fetch(telegramURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text: replyText,
        }),
      });

      return new Response("OK", { status: 200 });
    } catch (e) {
      console.log("ERROR:", e.message);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};

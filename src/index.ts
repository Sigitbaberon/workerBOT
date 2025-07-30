export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const update = await request.json();
    const message = update?.message?.text;
    const chat_id = update?.message?.chat?.id;

    if (!message || !chat_id) {
      return new Response("Invalid message", { status: 400 });
    }

    // 🔐 API KEY GEMINI ANDA
    const GEMINI_API_KEY = "AIzaSyDHYnj-E0V0h16thBf_-mycv4OnaKRxfgM";

    // 🔍 Kirim prompt ke Google Gemini
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: message }] }],
        }),
      }
    );

    const geminiData = await geminiResponse.json();
    const replyText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Maaf, saya tidak bisa membalas saat ini.";

    // Kirim balasan ke Telegram
    const TELEGRAM_BOT_TOKEN = "7341627486:AAFd7TdIjxVdSx3lfkrhgAZpB2VMMU0WjuI";
    const sendMessageURL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    await fetch(sendMessageURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id,
        text: replyText,
      }),
    });

    return new Response("OK", { status: 200 });
  },
};

const BOT_TOKEN = "7341627486:AAFd7TdIjxVdSx3lfkrhgAZpB2VMMU0WjuI";
const GEMINI_API_KEY = "AIzaSyDHYnj-E0V0h16thBf_-mycv4OnaKRxfgM";
const GEMINI_MODEL = "gemini-1.5-pro-latest";

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("Only POST requests are accepted", { status: 405 });
    }

    let payload;
    try {
      payload = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const chatId = payload?.message?.chat?.id;
    const userText = payload?.message?.text;

    if (!chatId || !userText) {
      return new Response("Missing chat ID or text", { status: 400 });
    }

    // Kirim ke Gemini
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }]
        })
      }
    );

    const geminiData = await geminiResp.json();
    const reply =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "❌ Gemini tidak membalas.";

    // Kirim ke Telegram
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: reply })
    });

    return new Response("OK");
  }
};

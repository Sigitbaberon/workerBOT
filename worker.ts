export default {
  async fetch(request) {
    const TELEGRAM_TOKEN = "7341627486:AAFd7TdIjxVdSx3lfkrhgAZpB2VMMU0WjuI";
    const GEMINI_API_KEY = "AIzaSyDHYnj-E0V0h16thBf_-mycv4OnaKRxfgM";

    if (request.method === "POST") {
      const update = await request.json();
      const message = update.message;
      const chatId = message.chat.id;
      const userText = message.text;

      if (!userText) {
        return new Response("No text message", { status: 200 });
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;
      const payload = {
        contents: [
          {
            parts: [{ text: userText }]
          }
        ]
      };

      try {
        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const geminiData = await geminiRes.json();
        const reply =
          geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "Maaf, tidak ada jawaban.";

        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: reply
          })
        });
      } catch (err) {
        console.error(err);
      }

      return new Response("OK", { status: 200 });
    }

    return new Response("Gunakan metode POST");
  }
}

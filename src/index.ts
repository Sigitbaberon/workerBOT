export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const body = await request.json();
      const chatId = body.message?.chat.id;
      const text = body.message?.text;

      const reply = {
        chat_id: chatId,
        text: `Halo! Kamu mengirim: ${text}`,
      };

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reply),
      });

      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },
};

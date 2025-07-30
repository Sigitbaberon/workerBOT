export default {
  async fetch(request, env, ctx) {
    const body = await request.json();

    const chatId = body.message.chat.id;
    const text = body.message.text;

    const reply = {
      chat_id: chatId,
      text: `Kamu bilang: ${text}`
    };

    await fetch(`https://api.telegram.org/bot7341627486:AAFd7TdIjxVdSx3lfkrhgAZpB2VMMU0WjuI/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reply)
    });

    return new Response('OK');
  }
}

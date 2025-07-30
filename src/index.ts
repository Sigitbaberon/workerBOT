import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch'; // Gunakan node-fetch v2

const app = express();
app.use(bodyParser.json());

const TELEGRAM_TOKEN = '...ISI_TOKEN_BOT_KAMU...';
const GEMINI_API_KEY = 'AIzaSyDHYnj-E0V0h16thBf_-mycv4OnaKRxfgM';
const GEMINI_MODEL = 'gemini-2.5-pro';

const telegramAPI = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

app.post('/webhook', async (req, res) => {
  const msg = req.body.message;
  const chatId = msg.chat.id;
  const userText = msg.text;

  // Panggil API Gemini
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: userText }]
          }
        ]
      })
    }
  );

  const geminiData = await geminiResponse.json();
  const reply =
    geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'Maaf, tidak ada respon.';

  // Kirim balasan ke Telegram
  await fetch(`${telegramAPI}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: reply
    })
  });

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot jalan di port ${PORT}`);
});

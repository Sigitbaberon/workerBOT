const BASE_URL = `https://api.telegram.org/bot${TOKEN}`;

export class TelegramBot {
  constructor(public token: string) {}

  async sendMessage(chatId: number, text: string, buttons?: string[][]) {
    const keyboard = buttons
      ? { inline_keyboard: buttons.map(row => row.map(btn => ({ text: btn, callback_data: btn }))) }
      : undefined;

    return fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }),
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const sendText = (chatId: number, text: string, markdown = false) =>
  fetch(`${BASE_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: markdown ? 'Markdown' : undefined
    })
  });

export const sendButtons = (chatId: number, text: string, buttons: string[][]) =>
  fetch(`${BASE_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: buttons,
        resize_keyboard: true,
        one_time_keyboard: false
      }
    })
  });
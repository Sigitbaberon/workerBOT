import { sendButtons, sendText } from './utils/telegram';

export async function handleStart(chatId: number) {
  return sendButtons(chatId, "👋 Selamat datang di *Ragnet Tools*! Silakan pilih menu di bawah ini:", [
    ['🎯 Submit Tugas', '🚀 Kerjakan Tugas'],
    ['💼 Profil Saya']
  ]);
}

export async function handleProfile(chatId: number) {
  const user = await KV.get(`users:${chatId}`, 'json') || { coins: 0 };
  return sendText(chatId, `👤 *Profil Anda*\nID: \`${chatId}\`\n💰 Koin: *${user.coins}*`, true);
}

export async function handleSubmit(chatId: number) {
  return sendText(chatId, '📌 Fitur *Submit Tugas* sedang dikembangkan...', true);
}

export async function handleWork(chatId: number) {
  return sendText(chatId, '🔍 Fitur *Kerjakan Tugas* sedang dikembangkan...', true);
}
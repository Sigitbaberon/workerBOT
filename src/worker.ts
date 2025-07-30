import { Router } from 'itty-router';
import { TelegramBot, sendText, sendButtons } from './utils/telegram';
import {
  handleStart,
  handleProfile,
  handleSubmit,
  handleWork
} from './handlers';

const router = Router();
const bot = new TelegramBot(TOKEN); // TOKEN di-set via wrangler secret

router.post('/', async (request) => {
  const update = await request.json();
  const message = update.message || update.callback_query?.message;
  const chatId = message?.chat?.id;
  const text = update.message?.text;

  if (text === '/start') return handleStart(chatId);
  if (text === '💼 Profil Saya') return handleProfile(chatId);
  if (text === '🎯 Submit Tugas') return handleSubmit(chatId);
  if (text === '🚀 Kerjakan Tugas') return handleWork(chatId);

  return new Response('OK');
});

export default {
  fetch: router.handle
};
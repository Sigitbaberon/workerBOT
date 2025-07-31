import { Router } from 'itty-router'; import { Telegram } from 'grammy'; import { kv } from '@vercel/kv';

const router = Router(); const bot = new Telegram(BOT_TOKEN);

const taskTypes = { like: { label: '👍 Like', cost: 1 }, share: { label: '🔄 Share', cost: 2 }, view_video: { label: '▶️ Tonton Video', cost: 3 }, follow: { label: '➕ Follow', cost: 2 }, visit: { label: '🔗 Kunjungi Link', cost: 1 }, };

router.post('/webhook', async (req) => { const update = await req.json(); const msg = update.message || update.callback_query?.message; const from = update.message?.from || update.callback_query?.from; const userId = from.id.toString(); const text = update.message?.text || update.callback_query?.data;

const userKey = create-task-${userId}; const state = await kv.get(userKey) || {};

// Start command if (text === '/start') { await bot.sendMessage(userId, 'Selamat datang! Tekan tombol di bawah untuk membuat tugas.', { reply_markup: { inline_keyboard: [[{ text: '➕ Buat Tugas', callback_data: 'buat_tugas' }]], }, }); }

// Create task - step 1: choose type else if (text === 'buat_tugas') { await kv.set(userKey, { step: 'choose_type' }); await bot.sendMessage(userId, 'Pilih jenis tugas:', { reply_markup: { inline_keyboard: Object.keys(taskTypes).map((type) => [{ text: taskTypes[type].label, callback_data: tipe_${type}, }]), }, }); }

// Create task - step 2: insert URL else if (text.startsWith('tipe_')) { const taskType = text.replace('tipe_', ''); await kv.set(userKey, { step: 'input_url', type: taskType }); await bot.sendMessage(userId, Kirimkan URL target untuk tugas ${taskTypes[taskType].label}); }

// Create task - step 3: insert jumlah else if (state.step === 'input_url' && text.startsWith('http')) { state.url = text; state.step = 'jumlah'; await kv.set(userKey, state); await bot.sendMessage(userId, 'Berapa jumlah tugas yang ingin dibuat?', { reply_markup: { inline_keyboard: [ [ { text: '5', callback_data: 'jumlah_5' }, { text: '10', callback_data: 'jumlah_10' }, { text: '20', callback_data: 'jumlah_20' }, ], [{ text: 'Custom', callback_data: 'jumlah_custom' }], ], }, }); }

// Jumlah bawaan else if (text.startsWith('jumlah_')) { const jumlah = parseInt(text.split('_')[1]); state.jumlah = jumlah; state.step = 'konfirmasi'; await kv.set(userKey, state); const biaya = jumlah * taskTypes[state.type].cost; await bot.sendMessage(userId, Tugas: ${taskTypes[state.type].label}\nLink: ${state.url}\nJumlah: ${jumlah}\nTotal coin: ${biaya}\n Klik tombol di bawah untuk konfirmasi., { reply_markup: { inline_keyboard: [[{ text: '✅ Buat Sekarang', callback_data: 'buat_konfirmasi' }]], }, }); }

// Jumlah custom else if (text === 'jumlah_custom') { state.step = 'jumlah_custom'; await kv.set(userKey, state); await bot.sendMessage(userId, 'Masukkan jumlah tugas yang kamu inginkan (angka saja):'); } else if (state.step === 'jumlah_custom' && !isNaN(parseInt(text))) { const jumlah = parseInt(text); state.jumlah = jumlah; state.step = 'konfirmasi'; await kv.set(userKey, state); const biaya = jumlah * taskTypes[state.type].cost; await bot.sendMessage(userId, Tugas: ${taskTypes[state.type].label}\nLink: ${state.url}\nJumlah: ${jumlah}\nTotal coin: ${biaya}\n Klik tombol di bawah untuk konfirmasi., { reply_markup: { inline_keyboard: [[{ text: '✅ Buat Sekarang', callback_data: 'buat_konfirmasi' }]], }, }); }

// Konfirmasi pembuatan tugas else if (text === 'buat_konfirmasi') { // Di sini logika cek saldo coin & simpan ke DB tugas await bot.sendMessage(userId, '✅ Tugas berhasil dibuat dan akan segera dikerjakan pengguna lainnya.'); await kv.del(userKey); // Hapus state }

return new Response('OK'); });

export default router;


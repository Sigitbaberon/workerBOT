# Ragnet Tools Telegram Bot (Cloudflare Worker)

## Konsep
Bot Telegram peer-to-peer untuk saling like/follow/share Facebook berbasis koin, sistem tugas adil, UI tombol modern, animasi, dan profil unik per user.

## Deploy
1. Ganti `TELEGRAM_TOKEN` di `worker.js` dengan token bot Anda.
2. Deploy ke Cloudflare Worker.
3. Set webhook ke Worker URL:
   ```
   https://api.telegram.org/bot<token>/setWebhook?url=https://<worker-url>
   ```
4. Pastikan storage (KV/D1) sudah di-setup.

## Fitur
- Profil user berbasis ID Telegram.
- Saldo koin, history tugas.
- Buat tugas saling like/follow/share Facebook.
- Dapatkan koin dengan menyelesaikan tugas.
- UI tombol interaktif, animasi loading/status.
- Modern, responsif (Telegram Inline Keyboard).

## Kustomisasi
- Ubah reward/cost di bagian atas `worker.js`.
- Bisa ditambah fitur verifikasi jika ingin.

## Catatan
- Untuk demo, storage pakai globalThis/localStorage. Untuk production, pakai Cloudflare KV/D1.

---

> **Token bot Anda (sementara):**
> ```
> 8197335440:AAEY93jyo1P94iJ0rx2xPNb20c6H60BWjvg
> ```

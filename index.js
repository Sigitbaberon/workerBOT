addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

const users = new Map()
const tasks = []

async function handleRequest(request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("user") || "anonymous"

  const text = searchParams.get("text") || ""

  // Inisialisasi user jika belum ada
  if (!users.has(userId)) {
    users.set(userId, {
      coins: 10,
      tasks: [],
    })
  }

  if (text === "/start") {
    return responseWithMenu(userId)
  }

  // Fungsi tombol-tombol
  if (text === "👤 Profile") {
    return new Response(`🧾 Profile:
👤 ID: ${userId}
💰 Koin: ${users.get(userId).coins}
📦 Tugas: ${users.get(userId).tasks.length}`, { status: 200 })
  }

  if (text === "📝 Buat Tugas") {
    return new Response(`Silakan kirim link konten yang ingin kamu promosikan dengan format:
buat:<link>,<jumlah>`, { status: 200 })
  }

  if (text.startsWith("buat:")) {
    const [, data] = text.split("buat:")
    const [link, jumlah] = data.split(",")
    const jumlahInt = parseInt(jumlah)
    const user = users.get(userId)

    if (user.coins < jumlahInt) {
      return new Response("❌ Koin kamu tidak cukup untuk membuat tugas ini.", { status: 200 })
    }

    // Simpan tugas
    const task = {
      id: tasks.length + 1,
      owner: userId,
      link,
      jumlah: jumlahInt,
      done: 0,
    }

    tasks.push(task)
    user.tasks.push(task)
    user.coins -= jumlahInt

    return new Response(`✅ Tugas berhasil dibuat.
🔗 Link: ${link}
🎯 Target: ${jumlahInt}
💰 Sisa Koin: ${user.coins}`, { status: 200 })
  }

  if (text === "📋 Tugas Saya") {
    const user = users.get(userId)
    if (user.tasks.length === 0) return new Response("Kamu belum membuat tugas apapun.", { status: 200 })

    let list = user.tasks.map(t => `#${t.id} - ${t.link} (${t.done}/${t.jumlah})`).join("\n")
    return new Response(`🧾 Tugas Kamu:\n${list}`, { status: 200 })
  }

  if (text === "🚀 Kerjakan Tugas") {
    const available = tasks.filter(t => t.owner !== userId && t.done < t.jumlah)
    if (available.length === 0) return new Response("Tidak ada tugas tersedia saat ini.", { status: 200 })

    const task = available[0]
    task.done += 1
    users.get(userId).coins += 1

    return new Response(`✅ Selesaikan tugas ini:\n🔗 ${task.link}\n\n💰 Kamu dapat 1 koin.\nTotal koin kamu: ${users.get(userId).coins}`, { status: 200 })
  }

  return responseWithMenu(userId)
}

// Fungsi menampilkan tombol-tombol utama
function responseWithMenu(userId) {
  const body = `🎯 Selamat datang di Ragnet Tools Bot!

Silakan pilih menu:
- 👤 Profile
- 📝 Buat Tugas
- 📋 Tugas Saya
- 🚀 Kerjakan Tugas

Koin kamu: ${users.get(userId).coins}`

  return new Response(body, { status: 200 })
}

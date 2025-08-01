// File: src/index.js

export default { async fetch(request, env, ctx) { const url = new URL(request.url);

// Ubah ke bug host
const targetHost = "quiz.video.com";
const targetProtocol = "https:";

// Buat URL baru
const newUrl = `${targetProtocol}//${targetHost}${url.pathname}${url.search}`;

// Salin semua header dan ubah host
const newHeaders = new Headers(request.headers);
newHeaders.set("Host", targetHost);
newHeaders.set("X-Forwarded-Host", targetHost);
newHeaders.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "1.1.1.1");
newHeaders.set("User-Agent", "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36");

const modifiedRequest = new Request(newUrl, {
  method: request.method,
  headers: newHeaders,
  body: request.body,
  redirect: "manual",
});

try {
  const response = await fetch(modifiedRequest);

  // Ubah semua header agar tidak mengganggu HTTP Custom
  const resHeaders = new Headers(response.headers);
  resHeaders.set("access-control-allow-origin", "*");
  resHeaders.delete("content-security-policy");
  resHeaders.delete("content-security-policy-report-only");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: resHeaders,
  });
} catch (err) {
  return new Response("[Worker Error] " + err.toString(), {
    status: 502,
  });
}

}, };


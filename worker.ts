import { Router } from 'itty-router';

const router = Router();

router.get('/', () => {
  return new Response('Ragnet Tools Bot Aktif ✅', { status: 200 });
});

router.get('/ping', () => {
  return new Response('pong', { status: 200 });
});

// Endpoint contoh akses KV
router.get('/user/:id', async ({ params }) => {
  const user = await USER_DB.get(params.id);
  if (!user) {
    return new Response('User tidak ditemukan', { status: 404 });
  }
  return new Response(user, { status: 200 });
});

router.post('/user/:id', async (request, { params }) => {
  const body = await request.json();
  await USER_DB.put(params.id, JSON.stringify(body));
  return new Response('User disimpan', { status: 200 });
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    router.handle(request, env, ctx),
};

interface Env {
  USER_DB: KVNamespace;
  TASK_DB: KVNamespace;
  BOT_TOKEN: string;
}

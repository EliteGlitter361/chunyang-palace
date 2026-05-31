import { getJsonFromGithub } from '../utils/github';

function simpleHash(str, salt = 'appstore') {
  let hash = 0;
  const full = salt + str;
  for (let i = 0; i < full.length; i++) {
    const char = full.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), { status: 400, headers });
    }

    const { content: admins } = await getJsonFromGithub(env, 'data/adminuser.json');
    if (!admins || admins.length === 0) {
      return new Response(JSON.stringify({ error: '无管理员账户' }), { status: 403, headers });
    }

    const user = admins.find(a => a.username === username);
    if (!user) {
      return new Response(JSON.stringify({ error: '用户名或密码错误' }), { status: 401, headers });
    }

    const hashedInput = simpleHash(password, 'appstore');
    if (user.password !== hashedInput) {
      return new Response(JSON.stringify({ error: '用户名或密码错误' }), { status: 401, headers });
    }

    // 生成简易 token，格式: fake-jwt-{role}-{username}-{timestamp}
    const token = `fake-jwt-${user.role}-${user.username}-${Date.now()}`;
    const { password: _, ...safeUser } = user;
    return new Response(JSON.stringify({ user: safeUser, token }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
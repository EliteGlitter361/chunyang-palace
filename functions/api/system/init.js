import { getJsonFromGithub, writeJsonToGithub } from '../../utils/github';

function simpleHash(str, salt = 'appstore') {
  let hash = 0;
  const full = salt + str;
  for (let i = 0; i < full.length; i++) {
    hash = ((hash << 5) - hash) + full.charCodeAt(i);
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
    const body = await request.json();
    const { username, password, confirmPassword } = body;
    if (!username || !password || !confirmPassword) {
      return new Response(JSON.stringify({ error: '请填写完整信息' }), { status: 400, headers });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: '密码至少8位' }), { status: 400, headers });
    }
    if (password !== confirmPassword) {
      return new Response(JSON.stringify({ error: '两次密码不一致' }), { status: 400, headers });
    }

    let admins = [];
    let sha = null;
    try {
      const result = await getJsonFromGithub(env, 'data/adminuser.json');
      admins = result.content || [];
      sha = result.sha;
    } catch (e) {
      // 文件不存在是正常情况，继续
      console.warn(e);
    }

    if (admins.some(u => u.role === 'system')) {
      return new Response(JSON.stringify({ error: 'System 账户已存在' }), { status: 403, headers });
    }
    if (admins.some(u => u.username === username)) {
      return new Response(JSON.stringify({ error: '用户名已存在' }), { status: 409, headers });
    }

    const newSystem = {
      id: (admins.length || 0) + 1,
      username: username.trim(),
      password: simpleHash(password),
      role: 'system',
      auditPermission: 1,
      createdAt: new Date().toISOString(),
    };

    admins.push(newSystem);
    await writeJsonToGithub(env, 'data/adminuser.json', admins, sha, 'init system admin');

    const { password: _, ...safeUser } = newSystem;
    return new Response(JSON.stringify({ message: 'System 账户创建成功', user: safeUser }), { status: 201, headers });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
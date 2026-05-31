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

function verifyAdminToken(token, admins) {
  if (!token || !token.startsWith('fake-jwt-')) return null;
  const parts = token.split('-');
  if (parts.length < 4) return null;
  const role = parts[2];
  const username = parts[3];
  if (role !== 'admin') return null;
  return admins.find(a => a.username === username && a.role === 'admin') || null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  let adminsData = [];
  let sha = null;

  try {
    const result = await getJsonFromGithub(env, 'data/adminuser.json');
    adminsData = result.content || [];
    sha = result.sha;
    const currentUser = verifyAdminToken(token, adminsData);
    if (!currentUser) {
      return new Response(JSON.stringify({ error: '未授权' }), { status: 401, headers });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: '认证失败：' + e.message }), { status: 401, headers });
  }

  try {
    const { oldPassword, newPassword } = await request.json();
    if (!oldPassword || !newPassword) {
      return new Response(JSON.stringify({ error: '请提供原密码和新密码' }), { status: 400, headers });
    }
    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: '新密码至少8位' }), { status: 400, headers });
    }

    const userIndex = adminsData.findIndex(u => u.username === currentUser.username);
    if (userIndex === -1) {
      return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers });
    }
    const user = adminsData[userIndex];
    const hashedOld = simpleHash(oldPassword);
    if (user.password !== hashedOld) {
      return new Response(JSON.stringify({ error: '原密码错误' }), { status: 401, headers });
    }
    user.password = simpleHash(newPassword);
    await writeJsonToGithub(env, 'data/adminuser.json', adminsData, sha, `admin 修改密码`);
    return new Response(JSON.stringify({ message: '密码修改成功，请重新登录' }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
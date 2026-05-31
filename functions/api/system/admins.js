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

function verifySystemToken(token, admins) {
  if (!token || !token.startsWith('fake-jwt-')) return null;
  const parts = token.split('-');
  if (parts.length < 4) return null;
  const role = parts[2];
  const username = parts[3];
  if (role !== 'system') return null;
  return admins.find(a => a.username === username && a.role === 'system') || null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE' } });
  }

  // 认证
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  let adminsData = [];
  let sha = null;

  try {
    const result = await getJsonFromGithub(env, 'data/adminuser.json');
    adminsData = result.content || [];
    sha = result.sha;
    const currentUser = verifySystemToken(token, adminsData);
    if (!currentUser) {
      return new Response(JSON.stringify({ error: '需要 system 权限' }), { status: 403, headers });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: '认证失败：' + e.message }), { status: 401, headers });
  }

  // GET - 获取所有管理员（不返回密码）
  if (request.method === 'GET') {
    const safeList = adminsData.map(({ password, ...rest }) => rest);
    return new Response(JSON.stringify(safeList), { headers });
  }

  // POST - 创建新管理员
  if (request.method === 'POST') {
    try {
      const { username, password, auditPermission } = await request.json();
      if (!username || !password) {
        return new Response(JSON.stringify({ error: '用户名和密码必填' }), { status: 400, headers });
      }
      if (password.length < 8) {
        return new Response(JSON.stringify({ error: '密码至少8位' }), { status: 400, headers });
      }
      if (adminsData.some(a => a.username === username)) {
        return new Response(JSON.stringify({ error: '用户名已存在' }), { status: 409, headers });
      }

      const newAdmin = {
        id: (adminsData.length || 0) + 1,
        username,
        password: simpleHash(password),
        role: 'admin',
        auditPermission: auditPermission ? 1 : 0,
        createdAt: new Date().toISOString(),
      };

      adminsData.push(newAdmin);
      await writeJsonToGithub(env, 'data/adminuser.json', adminsData, sha, `创建管理员 ${username}`);
      const { password: _, ...safe } = newAdmin;
      return new Response(JSON.stringify({ message: '创建成功', user: safe }), { status: 201, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  // PUT - 修改审核权限
  if (request.method === 'PUT') {
    try {
      const { username, auditPermission } = await request.json();
      const user = adminsData.find(a => a.username === username);
      if (!user) {
        return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers });
      }
      if (user.role === 'system') {
        return new Response(JSON.stringify({ error: '不能修改 system 的审核权限' }), { status: 403, headers });
      }
      user.auditPermission = auditPermission ? 1 : 0;
      await writeJsonToGithub(env, 'data/adminuser.json', adminsData, sha, `更新 ${username} 审核权限`);
      return new Response(JSON.stringify({ message: '权限更新成功' }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  // DELETE - 删除管理员
  if (request.method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const username = url.searchParams.get('username');
      if (!username) {
        return new Response(JSON.stringify({ error: '缺少用户名参数' }), { status: 400, headers });
      }
      const index = adminsData.findIndex(a => a.username === username);
      if (index === -1) {
        return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers });
      }
      if (adminsData[index].role === 'system') {
        return new Response(JSON.stringify({ error: '不能删除 system 账户' }), { status: 403, headers });
      }
      adminsData.splice(index, 1);
      await writeJsonToGithub(env, 'data/adminuser.json', adminsData, sha, `删除管理员 ${username}`);
      return new Response(JSON.stringify({ message: '删除成功' }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}
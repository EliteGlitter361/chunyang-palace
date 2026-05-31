import { getJsonFromGithub } from '../../utils/github';

export async function onRequest(context) {
  const { env } = context;
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const { content } = await getJsonFromGithub(env, 'data/adminuser.json');
    const admins = content || [];
    const hasSystem = admins.some(u => u.role === 'system');
    return new Response(JSON.stringify({ exists: hasSystem }), { headers });
  } catch (e) {
    if (e.message.includes('404')) {
      return new Response(JSON.stringify({ exists: false }), { headers });
    }
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
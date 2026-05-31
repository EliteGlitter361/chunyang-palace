// functions/utils/github.js
function encodeBase64UTF8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeBase64UTF8(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

async function githubRequest(env, filePath, method, bodyData = null) {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = env;
  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    throw new Error('GitHub 环境变量缺失: GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN');
  }
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const options = {
    method,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'cloudflare-pages',
    },
  };
  if (bodyData) {
    options.body = JSON.stringify(bodyData);
    options.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, options);
  if (res.status === 404 && method === 'GET') {
    return { content: null, sha: null };
  }
  if (!res.ok) {
    let errorText = '';
    try {
      const errJson = await res.json();
      errorText = errJson.message || JSON.stringify(errJson);
    } catch {
      errorText = await res.text();
    }
    throw new Error(`GitHub ${method} 失败 (${res.status}): ${errorText}`);
  }
  if (method === 'GET') {
    const data = await res.json();
    return { content: JSON.parse(decodeBase64UTF8(data.content)), sha: data.sha };
  }
  // PUT 成功时有时会返回内容，有时为空
  try {
    return await res.json();
  } catch {
    return { success: true };
  }
}

export async function getJsonFromGithub(env, filePath) {
  return githubRequest(env, filePath, 'GET');
}

export async function writeJsonToGithub(env, filePath, content, sha = null, message = 'update') {
  const jsonStr = JSON.stringify(content, null, 2);
  const base64Content = encodeBase64UTF8(jsonStr);
  const body = { message, content: base64Content };
  if (sha) body.sha = sha;
  return githubRequest(env, filePath, 'PUT', body);
}
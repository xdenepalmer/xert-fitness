export function requestHeader(request, name) {
  if (typeof request.headers?.get === 'function') {
    return request.headers.get(name) || '';
  }

  const value = request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export async function requestJson(request) {
  if (request.body !== undefined) {
    if (typeof request.body === 'string' || Buffer.isBuffer(request.body)) {
      return JSON.parse(request.body.toString());
    }
    return request.body;
  }
  return request.json();
}

export async function requestText(request) {
  if (request.body !== undefined) {
    if (typeof request.body === 'string' || Buffer.isBuffer(request.body)) {
      return request.body.toString();
    }
    return JSON.stringify(request.body);
  }
  if (typeof request.text === 'function') return request.text();

  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export function sendJson(response, body, status = 200) {
  if (!response) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }

  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return response.status(status).json(body);
}

export function sendText(response, body, status = 200) {
  if (!response) return new Response(body, { status });
  return response.status(status).send(body);
}

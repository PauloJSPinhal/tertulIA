export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = 'https://api.deepseek.com' + url.pathname.replace(/^\/api-deepseek/, '') + url.search;

  const modifiedRequest = new Request(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
    redirect: 'follow',
  });

  return fetch(modifiedRequest);
}
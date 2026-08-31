export type ApiData = Record<string, any>;

export async function api<T = ApiData>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || payload.message || '请求失败 (' + response.status + ')');
  }
  return payload as T;
}

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}/api${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Cue-Client': 'web', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) {
    const fields = body.error?.fields?.fieldErrors;
    const detail = fields ? Object.entries(fields).map(([k,v]) => `${k}: ${(v as string[]).join(', ')}`).join(' · ') : '';
    throw new Error(`${body.error?.message || 'Không thể kết nối máy chủ.'}${detail ? ` ${detail}` : ''}`);
  }
  return body;
}
export const post = (path: string, data: unknown = {}) => api(path, { method: 'POST', body: JSON.stringify(data) });
export const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
export const dateTime = (s: string) => new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

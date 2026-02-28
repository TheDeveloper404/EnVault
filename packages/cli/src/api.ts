const DEFAULT_API_URL = 'http://localhost:3093';

export function getApiUrl(): string {
  return process.env.ENVAULT_API_URL || process.env.ENVALT_API_URL || DEFAULT_API_URL;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${getApiUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function apiFetchText(path: string, options: RequestInit = {}): Promise<string> {
  const url = `${getApiUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.text();
}

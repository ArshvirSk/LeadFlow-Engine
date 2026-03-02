import { Storage } from '@plasmohq/storage';

const API_URL = process.env.PLASMO_PUBLIC_API_URL ?? 'http://localhost:3001';
const storage = new Storage();

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type !== 'CAPTURE_LEAD') return;

  const token = await storage.get<string>('clerk_token');

  try {
    await fetch(`${API_URL}/api/v1/leads/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url: message.url }),
    });
  } catch (err) {
    console.error('[leadflow] Failed to ingest lead', err);
  }
});

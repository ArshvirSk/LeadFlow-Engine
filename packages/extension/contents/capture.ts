// Content script — auto-detect job listing pages and surface a capture button
// Runs on supported job board URLs (declared in manifest.host_permissions)

const SUPPORTED_PATTERNS: { test: RegExp; extract: () => string | null }[] = [
  {
    test: /upwork\.com\/jobs\//,
    extract: () => document.querySelector('h1')?.textContent?.trim() ?? null,
  },
  {
    test: /linkedin\.com\/jobs\/view\//,
    extract: () => document.querySelector('.job-details-jobs-unified-top-card__job-title')?.textContent?.trim() ?? null,
  },
];

function injectCaptureButton(title: string) {
  if (document.getElementById('leadflow-capture-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'leadflow-capture-btn';
  btn.textContent = '⚡ Capture in LeadFlow';
  btn.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 99999;
    background: #f59e0b; color: white; border: none; border-radius: 8px;
    padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-family: system-ui, sans-serif;
  `;
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_LEAD',
      url: window.location.href,
      title,
    });
    btn.textContent = '✓ Captured!';
    btn.style.background = '#22c55e';
    setTimeout(() => btn.remove(), 2000);
  });
  document.body.appendChild(btn);
}

const currentUrl = window.location.href;
for (const pattern of SUPPORTED_PATTERNS) {
  if (pattern.test.test(currentUrl)) {
    const title = pattern.extract();
    if (title) injectCaptureButton(title);
    break;
  }
}

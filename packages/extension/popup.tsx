import { useState } from "react";
import { useStorage } from "@plasmohq/storage/hook";

const API_URL = process.env.PLASMO_PUBLIC_API_URL ?? "http://localhost:3001";

export default function Popup() {
  const [token] = useStorage<string>("clerk_token");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const handleCapture = async () => {
    if (!url.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch(`${API_URL}/api/v1/leads/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("success");
      setMessage("Lead captured! It will be scored shortly.");
      setUrl("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleCurrentTab = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab.url) setUrl(tab.url);
  };

  return (
    <div
      style={{ width: 340, padding: 16, fontFamily: "system-ui, sans-serif" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            background: "#f59e0b",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          ⚡
        </div>
        <strong style={{ fontSize: 15 }}>LeadFlow Engine</strong>
      </div>

      {!token && (
        <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
          Sign in to LeadFlow dashboard first to use the extension.
        </p>
      )}

      <textarea
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a job listing URL…"
        rows={3}
        style={{
          width: "100%",
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 12,
          resize: "none",
          boxSizing: "border-box",
          outline: "none",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={handleCurrentTab}
          style={{
            flex: 1,
            padding: "7px 0",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            background: "#f8fafc",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Use current tab
        </button>
        <button
          onClick={handleCapture}
          disabled={status === "loading" || !url.trim()}
          style={{
            flex: 1,
            padding: "7px 0",
            background: "#f59e0b",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            opacity: status === "loading" ? 0.7 : 1,
          }}
        >
          {status === "loading" ? "Capturing…" : "Capture lead"}
        </button>
      </div>

      {message && (
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: status === "error" ? "#ef4444" : "#22c55e",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

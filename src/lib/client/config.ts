const configuredHttpUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "";
const configuredWsUrl = process.env.NEXT_PUBLIC_GAME_WS_URL || "";

function isLocalBrowserHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.") || hostname.startsWith("10.");
}

function configuredNetworkHost() {
  if (!configuredHttpUrl) return "";
  try {
    const hostname = new URL(configuredHttpUrl).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "";
    return hostname;
  } catch {
    return "";
  }
}

function deriveHttpUrl() {
  if (typeof window === "undefined") return configuredHttpUrl || "http://localhost:8787";
  if (isLocalBrowserHost(window.location.hostname)) return `http://${window.location.hostname}:8787`;
  return configuredHttpUrl || `${window.location.protocol}//${window.location.hostname}:8787`;
}

function deriveWsUrl() {
  if (typeof window === "undefined") return configuredWsUrl || "ws://localhost:8787";
  if (isLocalBrowserHost(window.location.hostname)) return `ws://${window.location.hostname}:8787`;
  return configuredWsUrl || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8787`;
}

export const gameHttpUrl = deriveHttpUrl();
export const gameWsUrl = deriveWsUrl();

export function getGameWsUrls() {
  const urls = new Set<string>();
  urls.add(gameWsUrl);
  if (configuredWsUrl) urls.add(configuredWsUrl);
  if (typeof window !== "undefined") {
    urls.add(`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8787`);
    const networkHost = configuredNetworkHost();
    if (networkHost) urls.add(`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${networkHost}:8787`);
  }
  return [...urls];
}

export function getPublicAppOrigin() {
  if (typeof window === "undefined") return "";
  const networkHost = configuredNetworkHost();
  if ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && networkHost) {
    return `${window.location.protocol}//${networkHost}:${window.location.port || "3000"}`;
  }
  return window.location.origin;
}

export function getOrCreateId(key: string) {
  if (typeof window === "undefined") return "server";
  const id = makeClientId();
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    window.localStorage.setItem(key, id);
  } catch {
    return id;
  }
  return id;
}

export function makeClientId() {
  const browserCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (browserCrypto?.getRandomValues) {
    browserCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

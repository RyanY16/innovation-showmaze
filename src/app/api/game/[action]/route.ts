import { NextRequest, NextResponse } from "next/server";

const backendBaseUrl = process.env.GAME_SERVER_INTERNAL_URL || "http://127.0.0.1:8787";

type RouteContext = {
  params: Promise<{ action: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { action } = await context.params;
  if (action !== "state") return NextResponse.json({ error: "Unknown game action." }, { status: 404 });
  const roomId = request.nextUrl.searchParams.get("roomId") ?? "";
  const playerId = request.nextUrl.searchParams.get("playerId") ?? "";
  return proxyJson(`${backendBaseUrl}/room-state?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(playerId)}`);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { action } = await context.params;
  const target = action === "join" ? "join-room" : action === "leave" ? "leave-room" : action === "input" ? "submit-input" : action === "create" ? "create-room" : "";
  if (!target) return NextResponse.json({ error: "Unknown game action." }, { status: 404 });
  const body = await request.text();
  return proxyJson(`${backendBaseUrl}/${target}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}

async function proxyJson(url: string, init?: RequestInit) {
  try {
    const response = await fetch(url, init);
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" }
    });
  } catch {
    return NextResponse.json({ error: "Local game server is not reachable." }, { status: 503 });
  }
}

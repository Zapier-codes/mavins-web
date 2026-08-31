// src/lib/growth/purchaseMetrics.ts
// Server-side ONLY. API key injected via env var, never sent to client.

interface PurchasePayload {
  service: string;
  link: string;
  quantity: number;
}

interface PurchaseResponse {
  order: number;
}

const GROWTH_API_BASE = 'https://growth-metrics-provider.com/api/v2';
const GROWTH_API_KEY = process.env.GROWTH_METRICS_API_KEY!;

export async function purchaseGrowthMetrics(payload: PurchasePayload): Promise<PurchaseResponse> {
  const res = await fetch(`${GROWTH_API_BASE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: GROWTH_API_KEY, action: 'add', service: payload.service, link: payload.link, quantity: payload.quantity }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Growth metrics purchase failed');
  return { order: data.order };
}

export async function getOrderStatus(orderId: string): Promise<any> {
  const res = await fetch(`${GROWTH_API_BASE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: GROWTH_API_KEY, action: 'status', order: orderId }),
  });
  return await res.json();
}

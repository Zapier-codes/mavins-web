// src/services/freshconnect/freshconnect.service.ts
/**
 * Fresh Connect API Integration
 * 
 * Base URL: https://freshconnectpanel.com/api/v2
 * 
 * Flow:
 * 1. On campaign creation, map campaign to Fresh Connect service
 * 2. Call add() to place order with YouTube URL + view quantity
 * 3. Store fresh_connect_order_id on campaign row
 * 4. Poll status via status() endpoint
 * 5. Update campaign streams based on delivered count
 */

const FRESH_CONNECT_BASE_URL = 'https://freshconnectpanel.com/api/v2';

function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_FRESH_CONNECT_API_KEY || process.env.FRESH_CONNECT_API_KEY;
  if (!key) throw new Error('FRESH_CONNECT_API_KEY not configured');
  return key;
}

interface FreshConnectService {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string;
  min: string;
  max: string;
  refill: boolean;
  cancel: boolean;
}

interface AddOrderResponse {
  order: number;
}

interface OrderStatusResponse {
  charge: string;
  start_count: string;
  status: string; // "Pending", "In progress", "Partial", "Completed", "Canceled"
  remains: string;
  currency: string;
}

interface BalanceResponse {
  balance: string;
  currency: string;
}

/**
 * Fetch available services from Fresh Connect
 */
export async function getServices(): Promise<FreshConnectService[]> {
  const key = getApiKey();
  const url = `${FRESH_CONNECT_BASE_URL}?key=${key}&action=services`;

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Fresh Connect services failed: ${res.status}`);

  return res.json();
}

/**
 * Place an order on Fresh Connect
 */
export async function addOrder(
  serviceId: number,
  link: string,
  quantity: number
): Promise<AddOrderResponse> {
  const key = getApiKey();
  const url = `${FRESH_CONNECT_BASE_URL}?key=${key}&action=add&service=${serviceId}&link=${encodeURIComponent(link)}&quantity=${quantity}`;

  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`Fresh Connect add order failed: ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return data;
}

/**
 * Get order status
 */
export async function getOrderStatus(orderId: number): Promise<OrderStatusResponse> {
  const key = getApiKey();
  const url = `${FRESH_CONNECT_BASE_URL}?key=${key}&action=status&order=${orderId}`;

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Fresh Connect status failed: ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return data;
}

/**
 * Get user balance
 */
export async function getBalance(): Promise<BalanceResponse> {
  const key = getApiKey();
  const url = `${FRESH_CONNECT_BASE_URL}?key=${key}&action=balance`;

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Fresh Connect balance failed: ${res.status}`);

  return res.json();
}

/**
 * Map campaign to Fresh Connect service
 * 
 * We need to find the right service ID for YouTube views.
 * The user should configure this, but we'll use a default mapping.
 */
export function findYouTubeViewService(services: FreshConnectService[]): FreshConnectService | null {
  // Look for services related to YouTube views
  const candidates = services.filter(s => 
    s.name.toLowerCase().includes('youtube') && 
    (s.name.toLowerCase().includes('view') || s.name.toLowerCase().includes('watch'))
  );

  if (candidates.length > 0) return candidates[0];

  // Fallback: any service with "view" in the name
  const fallback = services.find(s => s.name.toLowerCase().includes('view'));
  return fallback || null;
}

/**
 * Calculate quantity for Fresh Connect order
 * Fresh Connect expects raw quantity (number of views)
 */
export function calculateFreshConnectQuantity(viewCount: number): number {
  return Math.max(50, Math.round(viewCount));
}

// ── src/types/jobs.ts ── Job Payload Interfaces ─────────────────────
//
// Every job dispatched to BullMQ carries a typed payload. This file is
// the single source of truth for what data each job type expects.
//
// In C#, these are like the message/event classes you'd define for
// MassTransit consumers or Hangfire job arguments:
//   public class OrderConfirmationEmail { public string OrderId { get; set; } }
//
// Here we use TypeScript interfaces — same idea, zero runtime overhead.

// ── Queue Names ─────────────────────────────────────────────────────
// Centralised constants prevent typos when creating queues and workers.
// In C# MassTransit, these would be queue endpoint names.

export const QUEUE_NAMES = {
  EMAIL: 'email',
  INVENTORY: 'inventory',
  ORDER: 'order',
} as const;

// ── Job Names ───────────────────────────────────────────────────────
// Each queue can process multiple job types, identified by name.
// Think of these as the "message type" discriminator in a polymorphic queue.

export const JOB_NAMES = {
  // Email queue jobs
  ORDER_CONFIRMATION: 'order-confirmation',
  ORDER_STATUS_UPDATE: 'order-status-update',
  LOW_STOCK_ALERT: 'low-stock-alert',
  ABANDONED_CART_REMINDER: 'abandoned-cart-reminder',

  // Inventory queue jobs
  CHECK_LOW_STOCK: 'check-low-stock',

  // Order queue jobs
  PROCESS_ORDER_STATUS: 'process-order-status',
} as const;

// ── Email Job Payloads ──────────────────────────────────────────────

/** Sent after a customer places an order. */
export interface OrderConfirmationPayload {
  orderId: string;
  customerEmail: string;
  customerName: string;
  orderTotal: number;
  itemCount: number;
}

/** Sent when an order's status changes (e.g. shipped, delivered). */
export interface OrderStatusUpdatePayload {
  orderId: string;
  customerEmail: string;
  customerName: string;
  oldStatus: string;
  newStatus: string;
}

/** Sent to admin when a product's stock drops below the threshold. */
export interface LowStockAlertPayload {
  productId: string;
  productName: string;
  currentStock: number;
  threshold: number;
  sku: string | null;
}

/** Sent to a customer who left items in their cart. */
export interface AbandonedCartReminderPayload {
  cartId: string;
  customerEmail: string;
  customerName: string;
  itemCount: number;
  cartTotal: number;
}

// ── Inventory Job Payloads ──────────────────────────────────────────

/** Dispatched when a product update might have caused low stock. */
export interface CheckLowStockPayload {
  productId: string;
  productName: string;
  currentStock: number;
  sku: string | null;
}

// ── Order Job Payloads ──────────────────────────────────────────────

/** Dispatched when an order's status changes — triggers side effects. */
export interface ProcessOrderStatusPayload {
  orderId: string;
  customerEmail: string;
  customerName: string;
  oldStatus: string;
  newStatus: string;
}

// ── Union Types ─────────────────────────────────────────────────────
// Useful for type guards and generic job handlers.

export type EmailJobPayload =
  | OrderConfirmationPayload
  | OrderStatusUpdatePayload
  | LowStockAlertPayload
  | AbandonedCartReminderPayload;

export type InventoryJobPayload = CheckLowStockPayload;

export type OrderJobPayload = ProcessOrderStatusPayload;

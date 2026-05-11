// ── src/events/types.ts ── Event Names & Payload Interfaces ──────────
//
// This file defines the "contract" for our internal event system.
// Every event has a unique string name and a typed payload — producers
// emit events with these shapes, and consumers subscribe to them.
//
// WHY AN EVENT SYSTEM?
//   Events decouple the "what happened" from the "what should happen next".
//   The order service says "order.created" — it doesn't know or care that
//   an email gets sent, stock gets checked, or analytics get logged.
//   Each concern lives in its own handler.
//
// .NET/C# COMPARISON:
// ──────────────────────────────────────────────────────────────────────
//   C# (MediatR / Domain Events)         │  Node.js (EventEmitter)
//   ─────────────────────────────────────│──────────────────────────────
//   INotification (marker interface)      │  Event name string constant
//   INotificationHandler<T>              │  eventBus.on(name, handler)
//   await _mediator.Publish(event)       │  eventBus.emit(name, payload)
//   DI scans for all INotificationHandler│  Manual registration in index.ts
//
//   The key difference: C# MediatR uses DI + reflection to discover handlers.
//   Node.js EventEmitter requires explicit registration — we call eventBus.on()
//   for each handler at startup. Same pattern, different wiring mechanism.

// ── Event Name Constants ────────────────────────────────────────────
// Centralised constants prevent typos — you get IntelliSense + compile errors.
// In C#, these would be class names: OrderCreatedEvent, PaymentCompletedEvent, etc.

export const EVENT_NAMES = {
  // Order lifecycle events
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.statusChanged',

  // Payment events (triggered by webhook processing)
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
} as const;

// ── Event Payload Interfaces ─────────────────────────────────────────
// Each event carries just enough data for its handlers. Handlers can
// query the DB for more details if needed — keep payloads lean.

/** Emitted after a new order is created during checkout. */
export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  customerEmail: string;
  customerName: string;
  orderTotal: number;
  itemCount: number;
  /** Product IDs in the order — used for stock checks */
  productIds: string[];
}

/** Emitted when an admin changes an order's status. */
export interface OrderStatusChangedPayload {
  orderId: string;
  orderNumber: string;
  userId: string;
  customerEmail: string;
  customerName: string;
  oldStatus: string;
  newStatus: string;
}

/** Emitted when a payment webhook confirms successful payment. */
export interface PaymentCompletedPayload {
  paymentId: string;
  orderId: string;
  amount: number;
  provider: string;
  providerPaymentId: string;
}

/** Emitted when a payment webhook reports a failed payment. */
export interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  provider: string;
  providerPaymentId: string;
  reason?: string;
}

// ── Type Map ─────────────────────────────────────────────────────────
// Maps event names to their payload types. Used by the typed EventBus
// to enforce correct emit/on signatures at compile time.
//
// In C#, you'd achieve this with generic INotification<T> — the compiler
// ensures handler and publisher agree on the payload type. Same idea here,
// just using a mapped type instead of generics.

export interface EventMap {
  [EVENT_NAMES.ORDER_CREATED]: OrderCreatedPayload;
  [EVENT_NAMES.ORDER_STATUS_CHANGED]: OrderStatusChangedPayload;
  [EVENT_NAMES.PAYMENT_COMPLETED]: PaymentCompletedPayload;
  [EVENT_NAMES.PAYMENT_FAILED]: PaymentFailedPayload;
}

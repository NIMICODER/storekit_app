// ── src/events/index.ts ── Event System Bootstrap ─────────────────────
//
// Registers all event handlers at application startup. Call this once
// from server.ts after the database and queues are ready.
//
// This is our manual version of C# DI's assembly scanning:
//   services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(Program).Assembly));
//
// In C#, MediatR uses reflection to find all INotificationHandler<T>
// implementations. In Node.js, we register handlers explicitly.
// Explicit registration means you can see every handler at a glance —
// no "where is this handler registered?" mystery.

import { registerOrderEvents } from './handlers/order.events';
import { registerPaymentEvents } from './handlers/payment.events';
import { registerInventoryEvents } from './handlers/inventory.events';

/**
 * Register all event handlers with the event bus.
 *
 * Call this ONCE at startup after database and queue connections are ready.
 * Order of registration doesn't matter — events are dispatched to all
 * listeners regardless of registration order.
 *
 * In C#, this is like calling services.AddMediatR() in Startup.cs.
 */
export function registerAllEvents(): void {
  // eslint-disable-next-line no-console
  console.log('[Events] Registering all event handlers...');

  registerOrderEvents();
  registerPaymentEvents();
  registerInventoryEvents();

  // eslint-disable-next-line no-console
  console.log('[Events] All event handlers registered');
}

// Re-export for convenience — modules that emit events import from here
export { eventBus } from './eventBus';
export { EVENT_NAMES } from './types';
export type {
  OrderCreatedPayload,
  OrderStatusChangedPayload,
  PaymentCompletedPayload,
  PaymentFailedPayload,
} from './types';

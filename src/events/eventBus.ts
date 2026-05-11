// ── src/events/eventBus.ts ── Typed EventEmitter Singleton ────────────
//
// A thin wrapper around Node.js's built-in EventEmitter that adds
// TypeScript type safety. When you emit 'order.created', the compiler
// ensures the payload matches OrderCreatedPayload.
//
// WHY EventEmitter (not a library)?
//   EventEmitter is built into Node.js — zero dependencies, zero overhead.
//   It's in-process (same Node.js instance), synchronous dispatch, and
//   perfect for decoupling modules within a single service.
//
//   If we needed cross-service events (microservices), we'd use Redis
//   Pub/Sub, RabbitMQ, or Kafka instead. EventEmitter is local-only.
//
// .NET COMPARISON:
// ──────────────────────────────────────────────────────────────────────
//   C# MediatR                            │  Node.js EventEmitter
//   ─────────────────────────────────────│──────────────────────────────
//   _mediator.Publish(notification)       │  eventBus.emit(name, payload)
//   INotificationHandler<T>.Handle()      │  eventBus.on(name, handler)
//   DI resolves all matching handlers     │  Explicit .on() calls at startup
//   Async by default (Task)               │  Sync dispatch, async handlers OK
//
//   EventEmitter calls handlers synchronously (one after another), but
//   each handler can be an async function. The emit() call returns
//   immediately — it doesn't await the handlers. This means handlers
//   run concurrently after being dispatched, which is exactly what we
//   want: fire-and-forget side effects that don't block the main flow.

import { EventEmitter } from 'events';
import type { EventMap } from './types';

// ── Typed EventBus Class ──────────────────────────────────────────────
//
// We override emit() and on() to enforce our EventMap types.
// Without this, EventEmitter accepts any string and any args — no safety.

class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners to avoid Node.js warnings.
    // Default is 10 — we'll have more event handlers than that.
    // In C#, there's no listener limit on events/delegates.
    this.emitter.setMaxListeners(20);
  }

  /**
   * Emit a typed event. All registered handlers are called synchronously,
   * but async handlers run concurrently after dispatch.
   *
   * @param event - Event name (from EVENT_NAMES)
   * @param payload - Typed payload matching the event
   *
   * In C#: await _mediator.Publish(new OrderCreatedEvent { ... });
   */
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    // eslint-disable-next-line no-console
    console.log(`[EventBus] Emitting "${String(event)}"`);
    this.emitter.emit(String(event), payload);
  }

  /**
   * Subscribe to a typed event.
   *
   * @param event - Event name (from EVENT_NAMES)
   * @param handler - Callback receiving the typed payload
   *
   * Handlers can be async — errors in async handlers won't crash the
   * emitter because they return a Promise that settles independently.
   * We wrap handlers with error logging to catch unhandled rejections.
   *
   * In C#:
   *   public class OrderCreatedHandler : INotificationHandler<OrderCreatedEvent>
   *   {
   *     public async Task Handle(OrderCreatedEvent notification, CancellationToken ct) { ... }
   *   }
   */
  on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>,
  ): void {
    this.emitter.on(String(event), async (payload: EventMap[K]) => {
      try {
        await handler(payload);
      } catch (error) {
        // Log but don't rethrow — one failing handler shouldn't affect others.
        // In C#, MediatR also catches per-handler exceptions by default.
        // eslint-disable-next-line no-console
        console.error(
          `[EventBus] Handler error for "${String(event)}":`,
          error instanceof Error ? error.message : error,
        );
      }
    });
  }

  /**
   * Remove all listeners for a specific event (useful for testing).
   * In C#, this is like unsubscribing all delegates: event -= handler;
   */
  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    if (event) {
      this.emitter.removeAllListeners(String(event));
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

// ── Export Singleton ──────────────────────────────────────────────────
// One event bus per process — all modules import the same instance.
// In C#, MediatR is registered as a singleton in DI too.

export const eventBus = new EventBus();

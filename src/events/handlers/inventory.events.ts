// ── src/events/handlers/inventory.events.ts ── Inventory Event Handlers
//
// Listens to order events and dispatches inventory-related side effects:
//   - order.created → queue low-stock checks for each purchased product
//
// When a customer buys products, stock is decremented during checkout.
// This handler checks if any of those products are now below the low-stock
// threshold and queues alert emails to the admin.
//
// WHY NOT CHECK STOCK IN THE CHECKOUT SERVICE?
//   The checkout service's job is to create the order — it shouldn't also
//   be responsible for inventory alerts. By listening to order.created,
//   the inventory concern stays isolated. If we add more inventory logic
//   later (auto-reorder, disable product listing, etc.), it all lives here.
//
// .NET COMPARISON:
//   public class OrderCreatedInventoryHandler : INotificationHandler<OrderCreatedEvent>
//   {
//     private readonly IInventoryService _inventory;
//     public async Task Handle(OrderCreatedEvent evt, CancellationToken ct)
//     {
//       foreach (var productId in evt.ProductIds)
//         await _inventory.CheckLowStockAsync(productId);
//     }
//   }

import { eventBus } from '../eventBus';
import { EVENT_NAMES } from '../types';
import type { OrderCreatedPayload } from '../types';
import { queueLowStockCheck } from '../../queues/inventory.queue';
import prisma from '../../config/database';

// ── Handler: order.created → Check Low Stock ──────────────────────────
//
// For each product in the order, look up its current stock and queue a
// low-stock check job. The inventory worker compares stock vs threshold
// and sends alert emails if needed.

async function handleOrderCreatedInventory(payload: OrderCreatedPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[InventoryEvents] order.created → checking stock for ${payload.productIds.length} products`,
  );

  try {
    // Fetch current stock for all products in the order.
    // We query the DB because the event payload only has IDs — not stock levels.
    // This is intentional: events carry minimal data, handlers query what they need.
    const products = await prisma.product.findMany({
      where: { id: { in: payload.productIds } },
      select: { id: true, name: true, stock: true, sku: true },
    });

    // Queue a low-stock check for each product (fire-and-forget).
    // The inventory worker will decide whether to send an alert.
    for (const product of products) {
      queueLowStockCheck({
        productId: product.id,
        productName: product.name,
        currentStock: product.stock,
        sku: product.sku ?? null,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[InventoryEvents] Failed to queue stock check for "${product.name}":`,
          err instanceof Error ? err.message : err,
        );
      });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[InventoryEvents] Failed to handle order.created for inventory:',
      error instanceof Error ? error.message : error,
    );
  }
}

// ── Registration ─────────────────────────────────────────────────────

export function registerInventoryEvents(): void {
  eventBus.on(EVENT_NAMES.ORDER_CREATED, handleOrderCreatedInventory);

  // eslint-disable-next-line no-console
  console.log('[InventoryEvents] Registered: order.created (stock check)');
}

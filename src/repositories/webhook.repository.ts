// ── src/repositories/webhook.repository.ts ── Webhook Event Data Access
//
// CRUD operations for the WebhookEvent model. Stores every incoming
// webhook payload from external services (payment providers, shipping, etc.)
// for idempotency checking, debugging, and replay capability.
//
// WHY STORE WEBHOOKS?
//   1. IDEMPOTENCY: Payment providers may send the same webhook multiple
//      times (at-least-once delivery). By recording each event, we can
//      check "have I seen this before?" and skip duplicates.
//   2. DEBUGGING: When a customer says "my payment went through but my
//      order isn't confirmed", you can look up the raw webhook payload.
//   3. REPLAY: If processing fails, you can re-process the stored event
//      without waiting for the provider to resend.
//
// .NET COMPARISON:
//   public class WebhookEventRepository : IWebhookEventRepository
//   {
//     Task<bool> ExistsAsync(string source, string eventId);
//     Task<WebhookEvent> CreateAsync(WebhookEvent evt);
//     Task MarkProcessedAsync(string id);
//     Task MarkFailedAsync(string id, string error);
//   }

import prisma from '../config/database';
import type { Prisma } from '../generated/prisma/client';

// ── Webhook Repository Class ──────────────────────────────────────────

class WebhookRepository {
  /**
   * Create a new webhook event record.
   *
   * Called as soon as a webhook request arrives (before processing).
   * This ensures we have a record even if processing fails.
   *
   * @param data - Source, event type, and raw payload from the provider
   */
  async create(data: {
    source: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
  }) {
    return prisma.webhookEvent.create({ data });
  }

  /**
   * Mark a webhook event as successfully processed.
   * Sets `processed = true` and records the processing timestamp.
   */
  async markProcessed(id: string) {
    return prisma.webhookEvent.update({
      where: { id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Mark a webhook event as failed with an error message.
   * The event stays `processed = false` so it can be retried.
   */
  async markFailed(id: string, error: string) {
    return prisma.webhookEvent.update({
      where: { id },
      data: { error },
    });
  }

  /**
   * Check if a webhook event from a specific source with a specific
   * event ID has already been processed. Used for idempotency.
   *
   * @param source - Provider name (e.g. "paystack", "stripe")
   * @param providerEventId - The provider's unique event ID
   * @returns true if already processed (skip!), false if new
   *
   * In C#: await dbContext.WebhookEvents.AnyAsync(e =>
   *   e.Source == source && e.ProviderEventId == providerEventId && e.Processed);
   */
  async existsProcessed(source: string, providerEventId: string): Promise<boolean> {
    // We check the payload for the provider's event ID since we don't
    // have a dedicated column for it. The event ID is embedded in the
    // JSON payload from the provider.
    //
    // Alternative: Add a `providerEventId` column with a unique index.
    // That's more efficient but requires a schema change. For now,
    // we query by source + processed status and check in the service layer.
    const existing = await prisma.webhookEvent.findFirst({
      where: {
        source,
        processed: true,
        // Use Prisma's JSON path filter to check the embedded event ID.
        // This works in PostgreSQL with JSONB columns.
        payload: {
          path: ['eventId'],
          equals: providerEventId,
        },
      },
    });

    return existing !== null;
  }

  /**
   * Find recent webhook events for debugging/admin view.
   */
  async findRecent(limit: number = 50) {
    return prisma.webhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

// ── Export Singleton ──────────────────────────────────────────────────

export const webhookRepository = new WebhookRepository();

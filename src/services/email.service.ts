// ── src/services/email.service.ts ── Email Sending via Nodemailer ────
//
// Wraps Nodemailer to send transactional emails (order confirmations,
// low-stock alerts, abandoned cart reminders, etc.).
//
// DEVELOPMENT MODE (Ethereal):
//   When SMTP_HOST is not set, we auto-create an Ethereal test account.
//   Ethereal is a fake SMTP service — emails are captured, not delivered.
//   After each send, we log a preview URL so you can see the email in
//   your browser. Zero config needed for development!
//
// PRODUCTION MODE:
//   Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env to use
//   a real SMTP provider (SendGrid, SES, Mailgun, etc.).
//
// In C#, this is like an IEmailSender service registered in DI:
//   services.AddTransient<IEmailSender, SmtpEmailSender>();
// Nodemailer plays the role of MailKit — it handles the SMTP protocol.

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { env } from '../config/env';

// ── Types ───────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string; // Plain-text fallback (auto-generated from HTML if omitted)
}

// ── Email Service Class ─────────────────────────────────────────────

class EmailService {
  private transporter: Transporter | null = null;
  private initializing: Promise<void> | null = null;

  /**
   * Lazy-initialize the SMTP transporter.
   *
   * Why lazy? Because in dev mode we need to create an Ethereal account
   * (async HTTP call) before we can configure the transporter. We don't
   * want to block app startup for this.
   *
   * In C#, this is like a Lazy<T> that initialises on first access:
   *   private readonly Lazy<SmtpClient> _client = new(() => CreateClient());
   */
  private async ensureTransporter(): Promise<Transporter> {
    if (this.transporter) return this.transporter;

    // Prevent multiple concurrent initialisations (race condition).
    // If init is already in progress, just wait for it.
    if (this.initializing) {
      await this.initializing;
      return this.transporter!;
    }

    this.initializing = this.initTransporter();
    await this.initializing;
    return this.transporter!;
  }

  /**
   * Create the Nodemailer transporter.
   *
   * - If SMTP creds are configured → use real SMTP.
   * - Otherwise → create an Ethereal test account automatically.
   *
   * Ethereal is a free fake SMTP service by the Nodemailer team.
   * It accepts any email but doesn't deliver it — instead it gives
   * you a web URL to preview what was sent. Perfect for development.
   */
  private async initTransporter(): Promise<void> {
    let transportConfig: SMTPTransport.Options;

    if (env.smtpHost) {
      // ── Production: Real SMTP ─────────────────────────────────────
      // eslint-disable-next-line no-console
      console.log(`[Email] Using SMTP: ${env.smtpHost}:${env.smtpPort}`);

      transportConfig = {
        host: env.smtpHost,
        port: env.smtpPort,
        // Use TLS for port 465, STARTTLS for others (587, 25).
        // Same as SmtpClient.EnableSsl in C#.
        secure: env.smtpPort === 465,
        auth: {
          user: env.smtpUser,
          pass: env.smtpPass,
        },
      };
    } else {
      // ── Development: Ethereal Fake SMTP ───────────────────────────
      // nodemailer.createTestAccount() hits the Ethereal API to create
      // a temporary mailbox. Emails sent here are viewable at ethereal.email.
      // eslint-disable-next-line no-console
      console.log('[Email] No SMTP configured — using Ethereal test account');

      const testAccount = await nodemailer.createTestAccount();

      // eslint-disable-next-line no-console
      console.log(`[Email] Ethereal user: ${testAccount.user}`);

      transportConfig = {
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      };
    }

    this.transporter = nodemailer.createTransport(transportConfig);
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Send an email. In development, logs an Ethereal preview URL.
   *
   * @param options - To address, subject, and HTML body.
   * @returns The message ID (or null if sending failed).
   *
   * Errors are caught and logged — email failures should never crash
   * the job worker. The job can be retried by BullMQ's retry mechanism.
   */
  async send(options: SendEmailOptions): Promise<string | null> {
    try {
      const transporter = await this.ensureTransporter();

      const info = await transporter.sendMail({
        from: env.emailFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      // In development (Ethereal), log the preview URL.
      // nodemailer.getTestMessageUrl() returns a URL like:
      //   https://ethereal.email/message/abc123
      // Open it in your browser to see the rendered email.
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        // eslint-disable-next-line no-console
        console.log(`[Email] Preview URL: ${previewUrl}`);
      }

      // eslint-disable-next-line no-console
      console.log(`[Email] Sent "${options.subject}" to ${options.to} (ID: ${info.messageId})`);

      return info.messageId;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[Email] Failed to send:',
        error instanceof Error ? error.message : error,
      );
      // Re-throw so BullMQ marks the job as failed and retries it.
      throw error;
    }
  }

  // ── Email Templates ─────────────────────────────────────────────────
  // Simple HTML templates for each email type. In a real app, you'd use
  // a template engine (Handlebars, MJML, React Email) or a service like
  // SendGrid Templates. For now, inline HTML keeps things simple.

  /** Order confirmation email HTML. */
  orderConfirmation(data: {
    customerName: string;
    orderId: string;
    orderTotal: number;
    itemCount: number;
  }): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Order Confirmed! 🎉</h1>
        <p>Hi ${data.customerName},</p>
        <p>Thank you for your order! Here's a summary:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Order ID</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.orderId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Items</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.itemCount} item(s)</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Total</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">$${data.orderTotal.toFixed(2)}</td>
          </tr>
        </table>
        <p>We'll send you another email when your order ships.</p>
        <p style="color: #666; font-size: 12px;">— The StoreKit Team</p>
      </div>
    `;
  }

  /** Order status update email HTML. */
  orderStatusUpdate(data: {
    customerName: string;
    orderId: string;
    oldStatus: string;
    newStatus: string;
  }): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Order Update</h1>
        <p>Hi ${data.customerName},</p>
        <p>Your order <strong>${data.orderId}</strong> status has changed:</p>
        <p style="font-size: 18px;">
          <span style="color: #999; text-decoration: line-through;">${data.oldStatus}</span>
          →
          <span style="color: #2ecc71; font-weight: bold;">${data.newStatus}</span>
        </p>
        <p style="color: #666; font-size: 12px;">— The StoreKit Team</p>
      </div>
    `;
  }

  /** Low stock alert email HTML (sent to admin). */
  lowStockAlert(data: {
    productName: string;
    currentStock: number;
    threshold: number;
    sku: string | null;
  }): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #e74c3c;">⚠️ Low Stock Alert</h1>
        <p>The following product is running low:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Product</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.productName}</td>
          </tr>
          ${data.sku ? `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>SKU</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.sku}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Current Stock</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #e74c3c; font-weight: bold;">
              ${data.currentStock}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Threshold</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.threshold}</td>
          </tr>
        </table>
        <p>Please restock this item soon.</p>
        <p style="color: #666; font-size: 12px;">— StoreKit Inventory System</p>
      </div>
    `;
  }

  /** Abandoned cart reminder email HTML. */
  abandonedCartReminder(data: {
    customerName: string;
    itemCount: number;
    cartTotal: number;
  }): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">You left something behind!</h1>
        <p>Hi ${data.customerName},</p>
        <p>You have <strong>${data.itemCount} item(s)</strong> worth
           <strong>$${data.cartTotal.toFixed(2)}</strong> waiting in your cart.</p>
        <p>Complete your purchase before they're gone!</p>
        <a href="#" style="display: inline-block; padding: 12px 24px; background: #3498db;
           color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
          Return to Cart
        </a>
        <p style="color: #666; font-size: 12px;">— The StoreKit Team</p>
      </div>
    `;
  }
}

// ── Export Singleton ─────────────────────────────────────────────────

export const emailService = new EmailService();

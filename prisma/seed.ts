/**
 * prisma/seed.ts — Database Seeder
 *
 * PURPOSE:
 *   Populates the database with realistic test data for development.
 *   Run with: `npm run db:seed`
 *
 * DESIGN DECISIONS:
 *   - IDEMPOTENT: Uses `upsert` (insert-or-update) so running the seed
 *     multiple times doesn't create duplicates. It either creates the record
 *     or updates it if the unique key already exists.
 *
 *   - REALISTIC DATA: Not "test1", "test2" — actual product names, prices,
 *     and descriptions so the API responses look professional during demos.
 *
 *   - ORDERED: Creates records in dependency order (users before orders,
 *     categories before products, etc.) to satisfy foreign key constraints.
 *
 * .NET EQUIVALENT:
 *   Similar to DbContext.Database.EnsureCreated() + a DbInitializer class,
 *   or EF Core's HasData() method in OnModelCreating().
 *   The difference: EF's HasData() is declarative (part of migrations).
 *   Prisma seeds are imperative scripts — more flexible, easier to debug.
 *
 * WHAT IS `upsert`?
 *   upsert = UPDATE + INSERT combined:
 *     - If a record with the given unique field exists → UPDATE it
 *     - If it doesn't exist → CREATE (INSERT) it
 *   This makes the seed script safe to run multiple times.
 *
 *   .NET equivalent: context.Users.AddOrUpdate(u => u.Email, newUser)
 *   or the MERGE statement in SQL Server.
 */

import { PrismaClient, UserRole, OrderStatus, PaymentStatus, DiscountType } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Create a dedicated Prisma Client for seeding (not the app singleton)
// This runs as a standalone script, not inside the Express server.
// We need to load dotenv here since this script runs independently.
import 'dotenv/config';

// Allow self-signed SSL certificates for cloud-hosted PostgreSQL (Aiven, etc.)
// Aiven uses certificates that Node.js doesn't trust by default.
// This must be set BEFORE any database connections are created.
// In production, you'd use the CA certificate from your provider instead.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Create pg Pool with SSL for cloud databases
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: true,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Seeding database...\n');

  // ── 1. USERS ────────────────────────────────────────────────────────────────
  // Create an admin and a regular customer.
  // TODO: Phase 6 will hash passwords with bcrypt. For now, storing plaintext
  // so we can focus on the database layer without auth complexity.

  const admin = await prisma.user.upsert({
    where: { email: 'admin@storekit.dev' },
    update: {},  // If exists, don't change anything
    create: {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@storekit.dev',
      password: 'admin123',  // TODO: Hash with bcrypt in Phase 6
      role: UserRole.ADMIN,
      phone: '+1-555-0100',
      address: {
        street: '123 Admin Street',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        country: 'US',
      },
    },
  });
  console.log(`  ✓ Admin user: ${admin.email}`);

  const customer = await prisma.user.upsert({
    where: { email: 'jane@example.com' },
    update: {},
    create: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      password: 'customer123',  // TODO: Hash with bcrypt in Phase 6
      role: UserRole.CUSTOMER,
      phone: '+1-555-0200',
      address: {
        street: '456 Oak Avenue',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        country: 'US',
      },
    },
  });
  console.log(`  ✓ Customer user: ${customer.email}`);

  // ── 2. CATEGORIES ──────────────────────────────────────────────────────────
  // Create a hierarchy: top-level categories with subcategories.
  // This demonstrates the self-referencing relation.

  const electronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: {
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices and accessories',
    },
  });

  const clothing = await prisma.category.upsert({
    where: { slug: 'clothing' },
    update: {},
    create: {
      name: 'Clothing',
      slug: 'clothing',
      description: 'Apparel and fashion items',
    },
  });

  const homeGarden = await prisma.category.upsert({
    where: { slug: 'home-garden' },
    update: {},
    create: {
      name: 'Home & Garden',
      slug: 'home-garden',
      description: 'Home improvement and garden supplies',
    },
  });

  // Subcategories (children of electronics)
  const phones = await prisma.category.upsert({
    where: { slug: 'phones' },
    update: {},
    create: {
      name: 'Phones',
      slug: 'phones',
      description: 'Smartphones and accessories',
      parentId: electronics.id,
    },
  });

  const laptops = await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {},
    create: {
      name: 'Laptops',
      slug: 'laptops',
      description: 'Laptops and notebooks',
      parentId: electronics.id,
    },
  });

  const audio = await prisma.category.upsert({
    where: { slug: 'audio' },
    update: {},
    create: {
      name: 'Audio',
      slug: 'audio',
      description: 'Headphones, speakers, and audio equipment',
      parentId: electronics.id,
    },
  });

  console.log(`  ✓ Categories: 6 (3 top-level, 3 subcategories)`);

  // ── 3. PRODUCTS ─────────────────────────────────────────────────────────────
  // Create products across categories with realistic data.
  // Note: `price` is a Decimal — Prisma accepts numbers or strings for Decimal fields.

  const products = await Promise.all([
    prisma.product.upsert({
      where: { slug: 'iphone-15-pro' },
      update: {},
      create: {
        name: 'iPhone 15 Pro',
        slug: 'iphone-15-pro',
        description: 'Latest Apple iPhone with A17 Pro chip, titanium design, and advanced camera system.',
        price: 999.99,
        compareAt: 1099.99,
        stock: 50,
        sku: 'PHONE-IP15P-256',
        images: JSON.stringify(['https://example.com/iphone15-1.jpg', 'https://example.com/iphone15-2.jpg']),
        isActive: true,
        categoryId: phones.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'samsung-galaxy-s24' },
      update: {},
      create: {
        name: 'Samsung Galaxy S24 Ultra',
        slug: 'samsung-galaxy-s24',
        description: 'Premium Android phone with S Pen, 200MP camera, and Galaxy AI features.',
        price: 1199.99,
        stock: 35,
        sku: 'PHONE-SGS24U-256',
        images: JSON.stringify(['https://example.com/galaxy-s24-1.jpg']),
        isActive: true,
        categoryId: phones.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'macbook-pro-14' },
      update: {},
      create: {
        name: 'MacBook Pro 14"',
        slug: 'macbook-pro-14',
        description: 'Apple M3 Pro chip, 18GB RAM, 512GB SSD. Built for professional workflows.',
        price: 1999.99,
        stock: 20,
        sku: 'LAPTOP-MBP14-M3P',
        images: JSON.stringify(['https://example.com/macbook-pro-1.jpg']),
        isActive: true,
        categoryId: laptops.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'dell-xps-15' },
      update: {},
      create: {
        name: 'Dell XPS 15',
        slug: 'dell-xps-15',
        description: 'Intel Core i7, 16GB RAM, 512GB SSD. Premium Windows ultrabook with OLED display.',
        price: 1499.99,
        compareAt: 1699.99,
        stock: 15,
        sku: 'LAPTOP-DXPS15-I7',
        images: JSON.stringify(['https://example.com/dell-xps-1.jpg']),
        isActive: true,
        categoryId: laptops.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'sony-wh1000xm5' },
      update: {},
      create: {
        name: 'Sony WH-1000XM5',
        slug: 'sony-wh1000xm5',
        description: 'Industry-leading noise cancelling headphones with 30-hour battery life.',
        price: 349.99,
        compareAt: 399.99,
        stock: 100,
        sku: 'AUDIO-SONYXM5',
        images: JSON.stringify(['https://example.com/sony-xm5-1.jpg']),
        isActive: true,
        categoryId: audio.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'airpods-pro-2' },
      update: {},
      create: {
        name: 'AirPods Pro 2',
        slug: 'airpods-pro-2',
        description: 'Apple H2 chip, adaptive noise cancellation, personalized spatial audio.',
        price: 249.99,
        stock: 200,
        sku: 'AUDIO-APP2',
        images: JSON.stringify(['https://example.com/airpods-pro-1.jpg']),
        isActive: true,
        categoryId: audio.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'cotton-crew-tshirt' },
      update: {},
      create: {
        name: 'Premium Cotton Crew T-Shirt',
        slug: 'cotton-crew-tshirt',
        description: '100% organic cotton, relaxed fit. Available in multiple colors.',
        price: 29.99,
        stock: 500,
        sku: 'CLOTH-TSHIRT-L',
        images: JSON.stringify(['https://example.com/tshirt-1.jpg']),
        isActive: true,
        categoryId: clothing.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'smart-led-desk-lamp' },
      update: {},
      create: {
        name: 'Smart LED Desk Lamp',
        slug: 'smart-led-desk-lamp',
        description: 'WiFi-enabled desk lamp with adjustable color temperature and brightness. Works with Alexa.',
        price: 59.99,
        compareAt: 79.99,
        stock: 75,
        sku: 'HOME-LAMP-LED01',
        images: JSON.stringify(['https://example.com/desk-lamp-1.jpg']),
        isActive: true,
        categoryId: homeGarden.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'ergonomic-office-chair' },
      update: {},
      create: {
        name: 'Ergonomic Office Chair',
        slug: 'ergonomic-office-chair',
        description: 'Adjustable lumbar support, breathable mesh back, 4D armrests. Rated for 8+ hours.',
        price: 449.99,
        stock: 30,
        sku: 'HOME-CHAIR-ERG01',
        images: JSON.stringify(['https://example.com/office-chair-1.jpg']),
        isActive: true,
        categoryId: homeGarden.id,
      },
    }),
    prisma.product.upsert({
      where: { slug: 'vintage-denim-jacket' },
      update: {},
      create: {
        name: 'Vintage Denim Jacket',
        slug: 'vintage-denim-jacket',
        description: 'Classic wash denim jacket with sherpa lining. Unisex fit.',
        price: 89.99,
        compareAt: 119.99,
        stock: 60,
        sku: 'CLOTH-DENIM-JKT',
        images: JSON.stringify(['https://example.com/denim-jacket-1.jpg']),
        isActive: true,
        categoryId: clothing.id,
      },
    }),
  ]);

  console.log(`  ✓ Products: ${products.length}`);

  // ── 4. REVIEWS ──────────────────────────────────────────────────────────────
  // Jane reviews some products she "purchased"

  await prisma.review.upsert({
    where: { userId_productId: { userId: customer.id, productId: products[0].id } },
    update: {},
    create: {
      userId: customer.id,
      productId: products[0].id,
      rating: 5,
      title: 'Best phone I have ever owned',
      comment: 'The camera quality is incredible and the battery lasts all day. Highly recommend!',
    },
  });

  await prisma.review.upsert({
    where: { userId_productId: { userId: customer.id, productId: products[4].id } },
    update: {},
    create: {
      userId: customer.id,
      productId: products[4].id,
      rating: 4,
      title: 'Great noise cancellation',
      comment: 'Excellent sound quality and ANC. Slightly heavy for long sessions.',
    },
  });

  await prisma.review.upsert({
    where: { userId_productId: { userId: admin.id, productId: products[2].id } },
    update: {},
    create: {
      userId: admin.id,
      productId: products[2].id,
      rating: 5,
      title: 'Perfect for development',
      comment: 'M3 Pro handles Docker, VS Code, and multiple browsers without breaking a sweat.',
    },
  });

  console.log(`  ✓ Reviews: 3`);

  // ── 5. COUPONS ──────────────────────────────────────────────────────────────

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      description: '10% off your first order',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      minimumAmount: 50,
      maximumDiscount: 100,
      usageLimit: 1000,
      isActive: true,
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'SAVE25' },
    update: {},
    create: {
      code: 'SAVE25',
      description: '$25 off orders over $200',
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 25,
      minimumAmount: 200,
      usageLimit: 500,
      isActive: true,
    },
  });

  console.log(`  ✓ Coupons: 2`);

  // ── 6. CART + ITEMS ─────────────────────────────────────────────────────────
  // Jane has some items in her cart (hasn't checked out yet)

  const cart = await prisma.cart.upsert({
    where: { userId: customer.id },
    update: {},
    create: {
      userId: customer.id,
    },
  });

  // Add items to cart using upsert on the composite unique key
  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId: products[4].id } },
    update: { quantity: 1 },
    create: {
      cartId: cart.id,
      productId: products[4].id,
      quantity: 1,
    },
  });

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId: products[6].id } },
    update: { quantity: 2 },
    create: {
      cartId: cart.id,
      productId: products[6].id,
      quantity: 2,
    },
  });

  console.log(`  ✓ Cart: 1 (with 2 items)`);

  // ── 7. ORDERS + ORDER ITEMS ────────────────────────────────────────────────
  // Jane has one completed order (iPhone purchase)

  const order = await prisma.order.upsert({
    where: { orderNumber: 'ORD-00001' },
    update: {},
    create: {
      orderNumber: 'ORD-00001',
      userId: customer.id,
      status: OrderStatus.DELIVERED,
      subtotal: 999.99,
      tax: 80.00,
      shippingCost: 0,
      discount: 0,
      total: 1079.99,
      shippingAddress: {
        street: '456 Oak Avenue',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        country: 'US',
      },
      notes: 'Please leave at the front door',
    },
  });

  // Order item (snapshot of the product at purchase time)
  await prisma.orderItem.upsert({
    where: { id: `${order.id}-item-1` },  // Pseudo-unique for idempotency
    update: {},
    create: {
      id: `${order.id}-item-1`,
      orderId: order.id,
      productId: products[0].id,
      productName: 'iPhone 15 Pro',
      quantity: 1,
      unitPrice: 999.99,
      totalPrice: 999.99,
    },
  });

  console.log(`  ✓ Orders: 1 (with 1 item)`);

  // ── 8. PAYMENT ──────────────────────────────────────────────────────────────

  await prisma.payment.upsert({
    where: { orderId: order.id },
    update: {},
    create: {
      orderId: order.id,
      status: PaymentStatus.COMPLETED,
      amount: 1079.99,
      currency: 'USD',
      provider: 'stripe',
      providerPaymentId: 'pi_mock_123456789',
      paidAt: new Date('2024-12-15T10:30:00Z'),
      metadata: {
        receipt_url: 'https://pay.stripe.com/receipt/mock_123',
        payment_method: 'card',
        last4: '4242',
      },
    },
  });

  console.log(`  ✓ Payments: 1`);

  // ── DONE ────────────────────────────────────────────────────────────────────
  console.log('\n✅ Database seeded successfully!\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute the seed function
// ─────────────────────────────────────────────────────────────────────────────
//
// .finally() ensures we disconnect from the database whether the seed
// succeeds or fails. This prevents hanging connections.
//
// This pattern is like a `using` block in C#:
//   using var context = new AppDbContext();
//   // ... seed logic ...
//   // Dispose() is called automatically at the end
main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

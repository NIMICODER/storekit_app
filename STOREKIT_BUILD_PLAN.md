# StoreKit API — Phase-by-Phase Build Plan
## A Production-Ready E-Commerce Backend in Node.js + TypeScript

> **Purpose:** This document is the master build plan for StoreKit API.
> Each phase is a standalone learning unit. Claude Code builds each phase
> one at a time, with heavy commenting so David learns every concept.
>
> **Tech Stack:**
> - Runtime: Node.js + TypeScript
> - Framework: Express.js
> - ORM: Prisma
> - Database: PostgreSQL
> - Cache: Redis
> - Queue: BullMQ (Redis-backed)
> - Auth: JWT + bcrypt
> - Validation: Zod
> - Testing: Vitest + Supertest
> - Documentation: Swagger/OpenAPI
> - Containerization: Docker + Docker Compose

---

## Phase Overview (14 Phases)

| # | Phase | What You Learn |
|---|-------|---------------|
| 1 | Project Setup & Configuration | Node.js project init, TypeScript config, ESLint, folder structure, env management |
| 2 | Express Server & Routing Fundamentals | HTTP server, routes, request/response cycle, middleware concept |
| 3 | Database & ORM (Prisma + PostgreSQL) | Schema design, migrations, Prisma Client, relations, seeding |
| 4 | Service Layer & Repository Pattern | Clean architecture, separation of concerns, dependency injection |
| 5 | Input Validation & Error Handling | Zod schemas, global error handler, custom error classes, request validation middleware |
| 6 | Authentication & Authorization | JWT, password hashing, auth middleware, role-based access control (RBAC) |
| 7 | Advanced CRUD & Query Features | Pagination, filtering, sorting, search, partial updates |
| 8 | File Uploads & Static Assets | Multer, image processing, cloud storage pattern, serving static files |
| 9 | Caching with Redis | Redis setup, cache middleware, cache invalidation strategies, session store |
| 10 | Background Jobs & Queue Processing | BullMQ, job scheduling, retries, email queue, inventory sync |
| 11 | Webhooks & Event System | Event emitter, webhook dispatch, payment webhook handling, retry logic |
| 12 | API Documentation & Rate Limiting | Swagger/OpenAPI auto-generation, rate limiting, CORS, security headers |
| 13 | Testing | Unit tests, integration tests, API tests, mocking, test database |
| 14 | Docker, CI/CD & Production Readiness | Dockerize, health checks, graceful shutdown, logging, deployment config |

---

## PHASE 1: Project Setup & Configuration

**Goal:** Initialize a professional Node.js + TypeScript project from scratch.

**What you'll learn:**
- `npm init` and `package.json` anatomy
- TypeScript compiler configuration (`tsconfig.json`)
- ESLint + Prettier for code quality
- Environment variable management with `dotenv`
- Node.js module system (ESM vs CommonJS)
- npm scripts for dev workflow
- Professional folder structure

**What Claude Code should build:**

```
storekit-api/
├── src/
│   ├── config/
│   │   └── env.ts                # Environment variable loading & validation
│   ├── app.ts                    # Express app setup (no server start)
│   └── server.ts                 # Server entry point (starts listening)
├── .env                          # Environment variables (gitignored)
├── .env.example                  # Template for environment variables
├── .eslintrc.json                # ESLint configuration
├── .prettierrc                   # Prettier configuration
├── .gitignore                    # Git ignore rules
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Project manifest & scripts
└── README.md                     # Project documentation
```

**Key npm scripts to include:**
- `dev` — run with hot reload (tsx watch)
- `build` — compile TypeScript
- `start` — run compiled JavaScript
- `lint` — run ESLint
- `format` — run Prettier

**Key dependencies:**
- `express`, `dotenv`, `cors`, `helmet`
- Dev: `typescript`, `tsx`, `@types/express`, `@types/node`, `eslint`, `prettier`

**Comment focus:** Explain every `tsconfig.json` option, every npm script, why `app.ts` and `server.ts` are separate, what each Express middleware does.

---

## PHASE 2: Express Server & Routing Fundamentals

**Goal:** Understand how Express handles HTTP requests, middleware, and routing.

**What you'll learn:**
- Express application lifecycle
- What middleware is and how the middleware chain works
- Route parameters, query strings, request body
- Router modules for organizing routes
- HTTP methods and REST conventions
- Request/Response objects
- Status codes and JSON responses
- Middleware execution order

**What Claude Code should build:**

```
src/
├── middleware/
│   ├── requestLogger.ts          # Logs every request (method, path, duration)
│   └── notFound.ts               # 404 handler for unmatched routes
├── routes/
│   ├── index.ts                  # Route aggregator (mounts all routers)
│   └── health.ts                 # Health check route
├── types/
│   └── express.d.ts              # Express type augmentation
├── utils/
│   └── apiResponse.ts            # Standardized API response helpers
├── app.ts                        # Updated with middleware & routes
└── server.ts                     # Updated with graceful shutdown basics
```

**Comment focus:** What `app.use()` does, middleware `next()` flow, difference between `app.get()` and `router.get()`, how Express parses JSON bodies, what `req.params` vs `req.query` vs `req.body` are, how status codes map to outcomes.

---

## PHASE 3: Database & ORM (Prisma + PostgreSQL)

**Goal:** Design the database schema and learn how Prisma ORM works.

**What you'll learn:**
- Prisma schema language and model definitions
- Database relations (1:1, 1:N, M:N)
- Migrations — creating and running
- Prisma Client — generated type-safe query API
- Seeding the database with initial data
- Database connection management
- How Prisma compares to Entity Framework

**What Claude Code should build:**

```
prisma/
├── schema.prisma                 # Full database schema
├── migrations/                   # Auto-generated migration files
└── seed.ts                       # Database seeder
src/
├── config/
│   └── database.ts               # Prisma client singleton
├── models/                       # (empty — Prisma generates types)
```

**Database entities to define:**
- `User` — id, email, password, name, role, phone, addresses
- `Category` — id, name, slug, description, parentId (self-referencing for subcategories)
- `Product` — id, name, slug, description, price, compareAtPrice, sku, stock, images, categoryId, isActive
- `Cart` — id, userId, items (relation), expiresAt
- `CartItem` — id, cartId, productId, quantity
- `Order` — id, userId, status, totalAmount, shippingAddress, paymentMethod, items
- `OrderItem` — id, orderId, productId, quantity, priceAtPurchase
- `Review` — id, userId, productId, rating, title, comment
- `Coupon` — id, code, discountType, discountValue, minPurchase, maxUses, usedCount, expiresAt
- `Payment` — id, orderId, provider, providerRef, amount, status, metadata
- `WebhookEvent` — id, provider, eventType, payload, processedAt

**Comment focus:** Every Prisma decorator (`@id`, `@unique`, `@relation`, `@default`), what a migration does vs EF Core migration, how Prisma Client is generated, why singleton pattern for DB connection.

---

## PHASE 4: Service Layer & Repository Pattern

**Goal:** Structure the codebase with clean architecture — separate concerns.

**What you'll learn:**
- Repository pattern (data access abstraction)
- Service layer (business logic)
- Controller layer (HTTP handling)
- Dependency flow: Controller → Service → Repository
- Why each layer exists and what belongs where
- How this maps to Clean Architecture in .NET

**What Claude Code should build:**

```
src/
├── repositories/
│   ├── base.repository.ts        # Generic base repository with common CRUD
│   ├── product.repository.ts     # Product-specific data access
│   ├── category.repository.ts    # Category-specific data access
│   └── user.repository.ts        # User-specific data access
├── services/
│   ├── product.service.ts        # Product business logic
│   ├── category.service.ts       # Category business logic
│   └── user.service.ts           # User business logic
├── controllers/
│   ├── product.controller.ts     # Product HTTP handlers
│   ├── category.controller.ts    # Category HTTP handlers
│   └── user.controller.ts        # User HTTP handlers
├── routes/
│   ├── product.routes.ts         # Product route definitions
│   ├── category.routes.ts        # Category route definitions
│   └── user.routes.ts            # User route definitions
```

**Comment focus:** Why we don't put Prisma queries in controllers, how the base repository uses generics (compare to C# `IRepository<T>`), what the service layer adds over raw CRUD, how controllers only handle HTTP concerns.

---

## PHASE 5: Input Validation & Error Handling

**Goal:** Validate all input and handle errors gracefully and consistently.

**What you'll learn:**
- Zod for schema validation (like FluentValidation in .NET)
- Request validation middleware
- Custom error classes with HTTP status codes
- Global error handling middleware
- Async error wrapper (no more try/catch in every controller)
- Operational vs programming errors
- Error response standardization

**What Claude Code should build:**

```
src/
├── errors/
│   ├── AppError.ts               # Base error class
│   ├── NotFoundError.ts          # 404 errors
│   ├── ValidationError.ts        # 400 validation errors
│   ├── UnauthorizedError.ts      # 401 errors
│   └── ForbiddenError.ts         # 403 errors
├── middleware/
│   ├── errorHandler.ts           # Global error handling middleware
│   ├── validate.ts               # Request validation middleware (uses Zod)
│   └── asyncWrapper.ts           # Wraps async route handlers
├── validators/
│   ├── product.validator.ts      # Product input schemas
│   ├── category.validator.ts     # Category input schemas
│   ├── user.validator.ts         # User input schemas
│   └── common.validator.ts       # Shared schemas (pagination, ID params)
```

**Comment focus:** How Zod compares to FluentValidation/DataAnnotations, why global error handler must have 4 params `(err, req, res, next)`, how `asyncWrapper` eliminates repetitive try/catch, difference between operational and unexpected errors.

---

## PHASE 6: Authentication & Authorization

**Goal:** Implement JWT-based auth with role-based access control.

**What you'll learn:**
- Password hashing with bcrypt
- JWT creation, signing, and verification
- Auth middleware (protecting routes)
- Refresh token rotation
- Role-based access control (RBAC)
- Extracting user from token
- Secure cookie handling
- How this compares to ASP.NET Identity / JWT Bearer

**What Claude Code should build:**

```
src/
├── services/
│   └── auth.service.ts           # Login, register, token management
├── controllers/
│   └── auth.controller.ts        # Auth endpoints
├── routes/
│   └── auth.routes.ts            # Auth route definitions
├── middleware/
│   ├── authenticate.ts           # JWT verification middleware
│   └── authorize.ts              # Role-checking middleware
├── utils/
│   ├── jwt.ts                    # JWT helper functions
│   └── password.ts               # Password hash/compare helpers
├── validators/
│   └── auth.validator.ts         # Login/register schemas
```

**Endpoints:**
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Get access + refresh tokens
- `POST /api/auth/refresh` — Refresh access token
- `POST /api/auth/logout` — Invalidate refresh token
- `GET /api/auth/me` — Get current user profile

**Roles:** `CUSTOMER`, `ADMIN`

**Comment focus:** How bcrypt salting works, JWT anatomy (header.payload.signature), why access tokens are short-lived, how middleware chain works for `authenticate → authorize → controller`, how this maps to `[Authorize(Roles = "Admin")]` in ASP.NET.

---

## PHASE 7: Advanced CRUD & Query Features

**Goal:** Build production-grade query capabilities.

**What you'll learn:**
- Cursor-based and offset pagination
- Dynamic filtering with query parameters
- Sorting by multiple fields
- Full-text search
- Partial updates (PATCH vs PUT)
- Soft deletes
- Slug generation
- Query builder pattern

**What Claude Code should build:**

```
src/
├── utils/
│   ├── pagination.ts             # Pagination helper (offset + cursor)
│   ├── queryBuilder.ts           # Dynamic Prisma query builder
│   └── slug.ts                   # URL slug generator
├── services/
│   └── (update existing services with advanced query support)
├── controllers/
│   └── (update existing controllers)
├── validators/
│   └── query.validator.ts        # Query parameter validation schemas
```

**Features to implement on Product endpoints:**
- `GET /api/products?page=1&limit=20` — Offset pagination
- `GET /api/products?cursor=abc&limit=20` — Cursor pagination
- `GET /api/products?category=electronics&minPrice=100&maxPrice=500` — Filtering
- `GET /api/products?sort=price:asc,createdAt:desc` — Multi-field sorting
- `GET /api/products?search=wireless headphones` — Full-text search
- `PATCH /api/products/:id` — Partial update
- `DELETE /api/products/:id` — Soft delete (sets `deletedAt`)

**Comment focus:** Why cursor pagination is better for large datasets, how Prisma's `where` clause maps to SQL, how query builder dynamically constructs Prisma queries, difference between PATCH and PUT semantics.

---

## PHASE 8: File Uploads & Static Assets

**Goal:** Handle file uploads for product images.

**What you'll learn:**
- Multer for multipart form data
- File validation (type, size)
- Image processing/resizing with Sharp
- Storage strategies (local vs cloud-ready)
- Serving static files
- Multiple file uploads
- Cleanup on failure

**What Claude Code should build:**

```
src/
├── middleware/
│   └── upload.ts                 # Multer configuration
├── services/
│   └── storage.service.ts        # File storage abstraction (local + cloud-ready interface)
├── utils/
│   └── imageProcessor.ts         # Sharp image resizing/optimization
├── uploads/                      # Local upload directory (gitignored)
│   ├── products/
│   └── avatars/
```

**Comment focus:** How Multer processes multipart form data (vs ASP.NET `IFormFile`), how storage abstraction allows swapping local for S3 later, how Sharp processes images in a Node.js stream, why file validation matters for security.

---

## PHASE 9: Caching with Redis

**Goal:** Add caching to speed up reads and reduce database load.

**What you'll learn:**
- Redis connection and client setup
- Cache-aside pattern (read-through)
- Cache invalidation strategies
- TTL (time-to-live) management
- Caching middleware for routes
- When to cache and when not to
- Redis data structures (strings, hashes, sets)
- How this compares to IDistributedCache in .NET

**What Claude Code should build:**

```
src/
├── config/
│   └── redis.ts                  # Redis client singleton
├── services/
│   └── cache.service.ts          # Cache abstraction with get/set/delete/invalidatePattern
├── middleware/
│   └── cache.ts                  # Route-level caching middleware
```

**What gets cached:**
- Product listings (with key based on query params)
- Individual product details
- Category tree
- Cache invalidation on create/update/delete

**Comment focus:** Redis vs in-memory cache, cache key naming conventions, why TTL matters, cache stampede problem, how middleware intercepts before controller, how invalidation patterns work (exact key vs wildcard).

---

## PHASE 10: Background Jobs & Queue Processing

**Goal:** Offload heavy/async work to background queues.

**What you'll learn:**
- BullMQ for job queues (Redis-backed)
- Producer/consumer pattern
- Job scheduling and retries
- Delayed jobs and cron jobs
- Concurrency control
- Dead letter queues
- How this compares to Hangfire/MassTransit in .NET

**What Claude Code should build:**

```
src/
├── queues/
│   ├── setup.ts                  # Queue connection & initialization
│   ├── email.queue.ts            # Email notification queue
│   ├── inventory.queue.ts        # Inventory sync/alert queue
│   └── order.queue.ts            # Order processing queue
├── workers/
│   ├── email.worker.ts           # Processes email jobs
│   ├── inventory.worker.ts       # Processes inventory jobs
│   └── order.worker.ts           # Processes order jobs
├── services/
│   └── email.service.ts          # Email sending logic (Nodemailer)
```

**Jobs to implement:**
- Order confirmation email (after checkout)
- Low stock alert (when product stock < threshold)
- Abandoned cart reminder (scheduled, checks carts older than 24h)
- Order status update notification

**Comment focus:** Why queues are needed (don't block the request), how BullMQ uses Redis, job lifecycle (waiting → active → completed/failed), retry strategies (exponential backoff), how workers run in the same or separate process.

---

## PHASE 11: Webhooks & Event System

**Goal:** Handle incoming webhooks and dispatch outgoing events.

**What you'll learn:**
- Node.js EventEmitter for internal events
- Webhook signature verification
- Idempotency (processing webhooks exactly once)
- Webhook event logging
- Outgoing webhook dispatch
- Payment flow with webhooks (Paystack/Stripe pattern)
- Retry logic for failed webhook deliveries

**What Claude Code should build:**

```
src/
├── events/
│   ├── eventBus.ts               # Application event bus (EventEmitter)
│   ├── handlers/
│   │   ├── order.events.ts       # Order event handlers
│   │   └── payment.events.ts     # Payment event handlers
│   └── types.ts                  # Event type definitions
├── webhooks/
│   ├── webhook.controller.ts     # Incoming webhook endpoint
│   ├── webhook.service.ts        # Webhook processing & verification
│   └── webhook.validator.ts      # Webhook payload validation
├── services/
│   ├── payment.service.ts        # Payment initiation & management
│   └── order.service.ts          # Order lifecycle management
├── controllers/
│   ├── order.controller.ts       # Order endpoints (checkout, history)
│   └── cart.controller.ts        # Cart endpoints (add, remove, get)
```

**Flow: Checkout → Payment → Webhook → Order Fulfillment**
1. Customer checks out → Order created with `PENDING_PAYMENT` status
2. Payment initiated → redirect to provider
3. Provider sends webhook → verify signature → update payment & order status
4. Internal event emitted → triggers email, inventory update

**Comment focus:** Why webhook verification is critical for security, idempotency keys and why you need them, how EventEmitter works (like C# events), why payment status should be driven by webhooks not frontend.

---

## PHASE 12: API Documentation & Rate Limiting

**Goal:** Document the API and add production security features.

**What you'll learn:**
- Swagger/OpenAPI spec auto-generation
- Rate limiting strategies (per IP, per user, per endpoint)
- CORS configuration
- Security headers with Helmet
- API versioning
- Request compression
- How this compares to Swashbuckle in ASP.NET

**What Claude Code should build:**

```
src/
├── config/
│   └── swagger.ts                # Swagger/OpenAPI configuration
├── middleware/
│   ├── rateLimiter.ts            # Rate limiting middleware (Redis-backed)
│   └── compression.ts            # Response compression
├── docs/
│   └── swagger.json              # Generated OpenAPI spec
```

**Comment focus:** How Swagger decorators/comments map to OpenAPI spec, sliding window vs fixed window rate limiting, why CORS exists and how to configure it properly, what each Helmet header protects against.

---

## PHASE 13: Testing

**Goal:** Write comprehensive tests — unit, integration, and API (end-to-end).

**What you'll learn:**
- Vitest as test runner (like xUnit/NUnit)
- Unit testing services with mocked dependencies
- Integration testing with a real test database
- API testing with Supertest
- Test factories for generating test data
- Code coverage
- Mocking patterns (manual mocks, `vi.mock`)
- Test database setup/teardown
- How this compares to xUnit + Moq + WebApplicationFactory in .NET

**What Claude Code should build:**

```
tests/
├── unit/
│   ├── services/
│   │   ├── product.service.test.ts
│   │   ├── auth.service.test.ts
│   │   └── order.service.test.ts
│   └── utils/
│       ├── pagination.test.ts
│       └── jwt.test.ts
├── integration/
│   ├── repositories/
│   │   └── product.repository.test.ts
│   └── services/
│       └── order.service.test.ts
├── api/
│   ├── auth.test.ts              # Auth endpoint tests
│   ├── products.test.ts          # Product CRUD tests
│   └── orders.test.ts            # Order flow tests
├── helpers/
│   ├── setup.ts                  # Global test setup/teardown
│   ├── factories.ts              # Test data factories
│   └── testClient.ts             # Supertest app instance
├── vitest.config.ts              # Vitest configuration
```

**Comment focus:** What to unit test vs integration test vs API test, why mocking matters (isolating the unit under test), how Supertest sends real HTTP requests to your Express app, why test databases should be separate, how factories help avoid brittle tests.

---

## PHASE 14: Docker, CI/CD & Production Readiness

**Goal:** Containerize and prepare for deployment.

**What you'll learn:**
- Dockerfile (multi-stage build)
- Docker Compose for local development
- Health check endpoints
- Graceful shutdown (handling SIGTERM/SIGINT)
- Structured logging (Pino)
- Environment-based configuration
- PM2 or Node.js cluster mode
- GitHub Actions CI pipeline
- How this compares to ASP.NET Docker patterns

**What Claude Code should build:**

```
├── Dockerfile                    # Multi-stage production Dockerfile
├── docker-compose.yml            # Full stack: app + Postgres + Redis
├── docker-compose.dev.yml        # Development overrides
├── .dockerignore                 # Docker ignore rules
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions: lint, test, build
src/
├── config/
│   └── logger.ts                 # Pino logger configuration
├── middleware/
│   └── requestId.ts              # Unique request ID middleware
├── utils/
│   └── shutdown.ts               # Graceful shutdown handler
```

**Comment focus:** Why multi-stage Docker builds reduce image size, how `SIGTERM` works in containers, why structured JSON logs matter in production, how Docker Compose networks services together, what a CI pipeline should validate.

---

## Build Rules for Claude Code

1. **One phase at a time.** Never build ahead. Wait for David to request the next phase.
2. **Comments everywhere.** Every file should have a header comment explaining its purpose. Every function should explain what it does and why. Complex lines get inline comments. Compare to C# equivalents where helpful.
3. **Working code only.** Each phase must compile and run. Include instructions to test what was built.
4. **Build on previous phases.** Each phase extends the existing codebase — don't rewrite what's already there.
5. **Explain new concepts in comments.** When introducing a Node.js/Express pattern for the first time, the comment should explain the concept, not just what the code does.
6. **Include a PHASE_NOTES.md** at the end of each phase summarizing what was built and key takeaways.
7. **Use consistent code style** — follow ESLint/Prettier config from Phase 1.
8. **Real-world patterns only** — no toy examples. Everything should be production-quality.

---

## How to Start

Tell Claude Code: *"Build Phase 1 of the StoreKit API. Follow the build plan in STOREKIT_BUILD_PLAN.md"*

Then after reviewing and understanding the code, move to the next phase:
*"Build Phase 2 of the StoreKit API. Follow the build plan in STOREKIT_BUILD_PLAN.md"*

And so on through all 14 phases.

---

*Let's build something great.* 🚀

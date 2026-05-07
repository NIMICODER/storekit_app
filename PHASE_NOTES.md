# Phase 1 & 2 Notes

---

# Phase 1 — Project Setup & Configuration

## What Was Built

```
store_kit_app/
├── src/
│   ├── config/env.ts     ← typed env config, fail-fast validation
│   ├── app.ts            ← Express app (helmet, cors, body parsers)
│   └── server.ts         ← HTTP server, process error handlers
├── .env / .env.example
├── .eslintrc.json / .prettierrc / .gitignore
├── tsconfig.json
└── package.json
```

## Key Concepts

### CommonJS vs ESM
We write `import`/`export` TypeScript — compiled to `require()` for Node.js.

### Why app.ts ≠ server.ts
- `app.ts` = "what does the app do?" (routes, middleware)
- `server.ts` = "how does the app run?" (port, process signals)
- Tests import `app` directly without binding a port

### Fail-Fast Env Config
`env.ts` validates variables at startup. Missing required config = immediate crash
with a clear message — not a silent failure mid-request.

### C# Comparisons
| Node.js | ASP.NET Core |
|---|---|
| `express()` | `WebApplicationBuilder().Build()` |
| `app.use()` | `app.UseMiddleware<T>()` |
| `env.ts` config | `IOptions<AppSettings>` |
| `tsconfig.json` | `.csproj` compiler settings |
| `npm` / `package.json` | NuGet / `.csproj` |

---

# Phase 2 — Express Server & Routing Fundamentals

## What Was Built

```
src/
├── middleware/
│   ├── requestLogger.ts  ← logs every request (method, path, status, duration, req ID)
│   └── notFound.ts       ← 404 handler for unmatched routes
├── routes/
│   ├── index.ts          ← route aggregator (mounts all feature routers)
│   └── health.ts         ← health check routes
├── types/
│   └── express.d.ts      ← TypeScript augmentation: adds requestId, startTime to req
├── utils/
│   └── apiResponse.ts    ← standardized response helpers
├── app.ts                ← updated: new middleware + router
└── server.ts             ← updated: SIGTERM/SIGINT graceful shutdown
```

## Live Endpoints

```
GET /                              → API info
GET /health                        → bare health (for load balancers)
GET /api/v1/health                 → full health (uptime, memory, services)
GET /api/v1/health/ping            → liveness probe ("pong")
GET /api/v1/health/ping?echo=hello → shows req.query in action
GET /api/v1/anything-else          → 404 JSON response
```

---

## Key Concepts Learned

### 1. Express Middleware — The Full Picture

Middleware is a function with signature `(req, res, next) => void`.

Every `app.use()` adds one to the pipeline. Express runs them in ORDER:

```
Request arrives
    ↓
requestLogger  → attach req.requestId, req.startTime; register 'finish' listener
    ↓
helmet()       → set security headers on every response
    ↓
cors()         → set CORS headers on every response
    ↓
express.json() → parse body bytes → populate req.body
    ↓
Route handlers → your actual business logic
    ↓
notFound       → catch everything that didn't match (MUST be last)
    ↓
Response sent  → 'finish' event fires → requestLogger logs duration + status
```

**The `next()` function:**
```typescript
function myMiddleware(req, res, next) {
  // Do something with req
  next();       // → pass to next middleware
  // next(error) → skip to error handler (Phase 5)
  // (nothing)  → request hangs forever! Don't forget next().
}
```

### 2. app.use() vs router.use()

```typescript
// app.use() — registers on the top-level app
app.use('/api/v1', apiRouter);  // All /api/v1/* goes to apiRouter

// router.use() — registers on a sub-router, relative to its mount point
router.use('/health', healthRouter);  // /health relative to where router is mounted
                                      // = /api/v1/health

// URL is composed:
// app prefix + router path + route path
// /api/v1   + /health     + /ping      = GET /api/v1/health/ping
```

### 3. req.params vs req.query vs req.body

```typescript
// Route defined as: router.get('/products/:id', handler)
// URL:              GET /api/v1/products/123?color=red&size=L
// Body:             { "note": "gift wrap" }

req.params.id      // "123"       ← from the :id route parameter
req.query.color    // "red"       ← from ?color=red
req.query.size     // "L"         ← from &size=L
req.body.note      // "gift wrap" ← from JSON body (POST/PUT/PATCH only)

// ALL query params are STRINGS. Always parse them if you need numbers:
const page = parseInt(req.query.page as string, 10);
```

### 4. HTTP Status Codes — What They Mean

```
2xx → Success
  200 OK          → GET success, generic success
  201 Created     → POST created a new resource
  204 No Content  → DELETE success, no body

4xx → Client Error (you did something wrong)
  400 Bad Request     → invalid input / malformed request
  401 Unauthorized    → not authenticated (no/invalid token)
  403 Forbidden       → authenticated but not authorized
  404 Not Found       → resource doesn't exist
  409 Conflict        → e.g., email already registered
  422 Unprocessable   → validation failed

5xx → Server Error (we did something wrong)
  500 Internal Server Error → unexpected crash
  503 Service Unavailable   → database down, overloaded
```

### 5. Consistent API Response Shape

Every endpoint in this API returns one of these shapes:

```json
// Success (single resource)
{ "success": true, "data": { ... }, "message": "optional" }

// Success (paginated list)
{ "success": true, "data": [...], "meta": { "total": 100, "page": 1, ... } }

// Error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

Frontend developers can always check `response.success` to know which branch to take.

### 6. TypeScript Declaration Merging

```typescript
// express.d.ts — augment Express's Request type
declare global {
  namespace Express {
    interface Request {
      requestId?: string;   // Our custom property
      startTime?: number;   // Our custom property
    }
  }
}
// Now req.requestId and req.startTime are valid TypeScript everywhere
```

### 7. Graceful Shutdown

```
SIGTERM/SIGINT arrives
    ↓
server.close()          → stop accepting NEW connections
    ↓
[existing connections drain]
    ↓
callback fires          → process.exit(0)

Safety: if drain takes > 10s → force process.exit(1)
```

### 8. C# Comparisons

| Node.js / Express | ASP.NET Core Equivalent |
|---|---|
| `Router()` | Controller class |
| `router.get('/:id')` | `[HttpGet("{id}")]` |
| `router.use('/health', h)` | `[Route("health")]` on controller |
| `req.params.id` | Route parameter `int id` |
| `req.query.page` | `[FromQuery] int page` |
| `req.body` | `[FromBody] CreateProductDto dto` |
| `res.status(201).json()` | `return Created(location, dto)` |
| `res.status(204).end()` | `return NoContent()` |
| `app.use(notFound)` | `app.UseStatusCodePages()` |
| SIGTERM handler | `IHostApplicationLifetime.StopApplication()` |

---

## Try It Yourself

```bash
npm run dev

# Test each endpoint
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/health/ping
curl "http://localhost:3000/api/v1/health/ping?echo=hello"
curl http://localhost:3000/api/v1/nonexistent

# Watch the terminal — requestLogger shows every request in color
```

---

## What's Next: Phase 3

Phase 3 adds the database layer:
- Prisma schema with all 11 entities (User, Product, Order, Cart, etc.)
- Migrations (creates the actual database tables)
- Database connection singleton (PrismaClient)
- Seeder script (populates test data)

You'll need PostgreSQL running locally (or via Docker) for Phase 3.

---

*Phase 2 complete. Test every endpoint, read every comment in the new files.*
*Pay special attention to the middleware pipeline order in app.ts.*

---

# Phase 3 — Database & ORM (Prisma + PostgreSQL)

## What Was Built

```
store_kit_app/
├── prisma/
│   ├── schema.prisma      ← 11 models, 4 enums, full relations & indexes
│   ├── seed.ts            ← idempotent seeder with realistic e-commerce data
│   └── migrations/        ← (created when you run db:migrate)
├── prisma.config.ts       ← Prisma v7 config (datasource URL from env)
├── src/
│   ├── config/
│   │   ├── database.ts    ← PrismaClient singleton + connect/disconnect lifecycle
│   │   └── env.ts         ← +DATABASE_URL (required)
│   ├── generated/prisma/  ← auto-generated Prisma Client (gitignored)
│   ├── routes/health.ts   ← updated: real DB connectivity check (SELECT 1)
│   └── server.ts          ← updated: DB connect on startup, disconnect on shutdown
└── package.json           ← +7 db: scripts, prisma seed config
```

## Database Schema — All 11 Models

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│    User      │────<│    Order      │────<│  OrderItem   │
│  (users)     │     │  (orders)     │     │ (order_items)│
└──────┬───────┘     └───────┬───────┘     └──────────────┘
       │                     │
       │              ┌──────┴───────┐
       │              │   Payment    │     ┌──────────────┐
       │              │  (payments)  │     │   Coupon     │
       │              └──────────────┘     │  (coupons)   │
       │                                   └──────────────┘
       │
  ┌────┴──────┐     ┌───────────────┐
  │   Cart    │────<│   CartItem    │
  │  (carts)  │     │ (cart_items)  │
  └───────────┘     └───────────────┘

  ┌───────────┐     ┌───────────────┐     ┌──────────────┐
  │  Review   │     │   Category    │────<│   Product    │
  │ (reviews) │     │ (categories)  │     │  (products)  │
  └───────────┘     │  (self-ref)   │     └──────────────┘
                    └───────────────┘

  ┌───────────────┐
  │ WebhookEvent  │  (standalone — for Phase 11)
  │(webhook_events│
  └───────────────┘
```

### Enums
- `UserRole`: CUSTOMER, ADMIN
- `OrderStatus`: PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED | CANCELLED
- `PaymentStatus`: PENDING, COMPLETED, FAILED, REFUNDED
- `DiscountType`: PERCENTAGE, FIXED_AMOUNT

## npm Scripts Added

```bash
npm run db:generate     # Regenerate Prisma Client after schema changes
npm run db:migrate      # Create + apply a new migration (dev only)
npm run db:migrate:prod # Apply pending migrations (production — no prompts)
npm run db:seed         # Populate database with test data
npm run db:studio       # Open Prisma Studio (visual DB browser)
npm run db:reset        # Drop all tables + re-migrate + re-seed (nuclear option)
npm run db:push         # Push schema to DB without creating a migration file
```

## Key Concepts

### 1. Prisma v7 Driver Adapter Pattern

Prisma v7 removed built-in database drivers. You now provide a "driver adapter":

```typescript
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: env.databaseUrl });
const prisma = new PrismaClient({ adapter });
```

This is similar to how EF Core uses database providers:
```csharp
// .NET equivalent
services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));
```

### 2. The Hot-Reload Singleton Pattern

```typescript
// Problem: tsx watch reloads → new PrismaClient each time → connection leak
// Fix: store on globalThis (survives hot-reloads)

declare global { var prisma: PrismaClient | undefined; }

const prisma = globalThis.prisma ?? createPrismaClient();
if (env.isDevelopment) globalThis.prisma = prisma;
```

### 3. UUID vs Auto-Increment

```
Auto-increment (1, 2, 3...):
  ✅ Small, fast joins
  ❌ Predictable (users can guess /api/users/2, /api/users/3)
  ❌ Bad for distributed systems (two servers can generate the same ID)

UUID (550e8400-e29b-41d4-a716-446655440000):
  ✅ Globally unique — safe for distributed systems
  ✅ Can be generated client-side before INSERT
  ✅ Non-sequential — can't enumerate resources
  ❌ 16 bytes vs 4 bytes (negligible in practice)
```

### 4. Decimal vs Float for Money

```
Float:   0.1 + 0.2 = 0.30000000000000004  ← WRONG
Decimal: 0.1 + 0.2 = 0.3                  ← CORRECT

Rule: ALWAYS use Decimal for money. In Prisma: @db.Decimal(10, 2)
In C#: decimal type | In PostgreSQL: NUMERIC(10,2)
```

### 5. Upsert = Idempotent Writes

```typescript
// If a user with this email exists → update it
// If not → create it
await prisma.user.upsert({
  where: { email: 'admin@storekit.dev' },
  update: {},     // no changes if exists
  create: { ... } // full object if new
});
```

### 6. Cascade Delete Rules

```
Cascade  → delete parent = delete children (Cart → CartItems)
Restrict → prevent parent deletion if children exist (User → Orders)
SetNull  → delete parent = set FK to NULL (Category → Products)
```

## Prisma vs EF Core Comparison

| Prisma (Node.js) | EF Core (.NET) |
|---|---|
| `schema.prisma` file | Entity classes + DbContext |
| `model User { ... }` | `public class User { ... }` |
| `@id @default(uuid())` | `[Key] [DatabaseGenerated]` |
| `@unique` | `[Index(IsUnique = true)]` |
| `@relation(fields:, references:)` | `.HasOne().WithMany()` Fluent API |
| `@@index([field])` | `.HasIndex(e => e.Field)` |
| `prisma migrate dev` | `dotnet ef migrations add` + `update` |
| `prisma.user.findMany()` | `context.Users.ToListAsync()` |
| `prisma.user.create()` | `context.Users.Add()` + `SaveChanges()` |
| `prisma.user.upsert()` | `AddOrUpdate()` / MERGE |
| `prisma db seed` | `DbInitializer.Seed()` |
| Prisma Studio | SQL Server Management Studio |

## Getting Started — Step by Step

```bash
# 1. Make sure PostgreSQL is running locally

# 2. Create the database (run in psql or pgAdmin):
#    CREATE DATABASE storekit_db;

# 3. Update .env with YOUR PostgreSQL credentials:
#    DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/storekit_db?schema=public

# 4. Generate the Prisma Client
npm run db:generate

# 5. Create tables via migration
npm run db:migrate
# → Enter a migration name like "init" when prompted

# 6. Seed test data
npm run db:seed

# 7. Browse your data visually
npm run db:studio

# 8. Start the server — health check now shows database: "connected"
npm run dev
curl http://localhost:3000/api/v1/health
```

## Seed Data Summary

| Entity | Count | Details |
|---|---|---|
| Users | 2 | 1 admin + 1 customer |
| Categories | 6 | 3 top-level + 3 subcategories (under Electronics) |
| Products | 10 | Phones, laptops, audio, clothing, home goods |
| Reviews | 3 | From both users |
| Coupons | 2 | WELCOME10 (10% off) + SAVE25 ($25 off) |
| Cart | 1 | Jane's cart with 2 items |
| Orders | 1 | Jane's delivered iPhone order |
| Payments | 1 | Completed Stripe payment |

---

*Phase 3 complete. Run through the "Getting Started" steps above.*
*Explore Prisma Studio (`npm run db:studio`) — click through each table.*
*Read every comment in schema.prisma and database.ts.*

---

# Phase 4 — Service Layer & Repository Pattern

## What Was Built

```
src/
├── repositories/
│   ├── base.repository.ts      ← Generic CRUD (findAll, findById, create, update, delete, count)
│   ├── product.repository.ts   ← Product-specific queries (findBySlug, findActiveProducts, etc.)
│   ├── category.repository.ts  ← Category-specific queries (findAllTree, findWithProducts, etc.)
│   └── user.repository.ts      ← User-specific queries (findByEmail, omit password, etc.)
├── services/
│   ├── product.service.ts      ← Product business logic (uniqueness checks, validation)
│   ├── category.service.ts     ← Category business logic (circular ref prevention)
│   └── user.service.ts         ← User business logic (profile-only updates)
├── controllers/
│   ├── product.controller.ts   ← Parse HTTP → call service → send response
│   ├── category.controller.ts  ← Parse HTTP → call service → send response
│   └── user.controller.ts      ← Parse HTTP → call service → send response
├── routes/
│   ├── product.routes.ts       ← 6 product endpoints
│   ├── category.routes.ts      ← 7 category endpoints
│   ├── user.routes.ts          ← 3 user endpoints
│   └── index.ts                ← UPDATED: mounts product/category/user routers
```

## Architecture — Clean Architecture Layers

```
HTTP Request → Route → Controller → Service → Repository → Prisma/DB
                 ↓          ↓           ↓           ↓
              URL map    Parse HTTP   Business    Data access
              + verbs    req/res      logic       abstraction
```

Each layer has ONE job:
- **Route**: Maps URL patterns + HTTP methods to controller functions
- **Controller**: Parses HTTP request, calls service, sends HTTP response
- **Service**: Enforces business rules (uniqueness, existence, validation)
- **Repository**: Executes database queries via Prisma

## API Endpoints (16 new, 20 total)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/products` | List products (paginated, filterable) |
| GET | `/api/v1/products/slug/:slug` | Get product by slug |
| GET | `/api/v1/products/:id` | Get product by ID |
| POST | `/api/v1/products` | Create product |
| PUT | `/api/v1/products/:id` | Update product |
| DELETE | `/api/v1/products/:id` | Delete product |
| GET | `/api/v1/categories` | List categories (flat or ?tree=true) |
| GET | `/api/v1/categories/slug/:slug` | Get category by slug |
| GET | `/api/v1/categories/:id` | Get category by ID |
| GET | `/api/v1/categories/:id/products` | Category's products (paginated) |
| POST | `/api/v1/categories` | Create category |
| PUT | `/api/v1/categories/:id` | Update category |
| DELETE | `/api/v1/categories/:id` | Delete category |
| GET | `/api/v1/users` | List users (admin, paginated) |
| GET | `/api/v1/users/:id` | Get user by ID |
| PUT | `/api/v1/users/:id` | Update user profile |

## Test with curl

```bash
# Start the server
npm run dev

# ── Products ──────────────────────────────────────────────────────────────

# List all products (paginated)
curl http://localhost:3000/api/v1/products

# Search products
curl "http://localhost:3000/api/v1/products?search=iphone"

# Filter by price range
curl "http://localhost:3000/api/v1/products?minPrice=50&maxPrice=500"

# Pagination
curl "http://localhost:3000/api/v1/products?page=1&limit=5"

# Get product by slug
curl http://localhost:3000/api/v1/products/slug/iphone-15-pro

# Create a product
curl -X POST http://localhost:3000/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Bluetooth Speaker","slug":"bluetooth-speaker","price":39.99,"stock":50}'

# Update a product (use an ID from the GET response)
curl -X PUT http://localhost:3000/api/v1/products/PRODUCT_ID_HERE \
  -H "Content-Type: application/json" \
  -d '{"price":44.99}'

# Delete a product
curl -X DELETE http://localhost:3000/api/v1/products/PRODUCT_ID_HERE

# ── Categories ────────────────────────────────────────────────────────────

# List categories (flat)
curl http://localhost:3000/api/v1/categories

# List categories (tree structure)
curl "http://localhost:3000/api/v1/categories?tree=true"

# Get category by slug
curl http://localhost:3000/api/v1/categories/slug/electronics

# Get category's products
curl http://localhost:3000/api/v1/categories/CATEGORY_ID_HERE/products

# Create a category
curl -X POST http://localhost:3000/api/v1/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Wearables","slug":"wearables","description":"Smartwatches and trackers"}'

# ── Users ─────────────────────────────────────────────────────────────────

# List users (no passwords in response!)
curl http://localhost:3000/api/v1/users

# Get user by ID
curl http://localhost:3000/api/v1/users/USER_ID_HERE

# Update user profile
curl -X PUT http://localhost:3000/api/v1/users/USER_ID_HERE \
  -H "Content-Type: application/json" \
  -d '{"firstName":"David","phone":"+1-555-1234"}'
```

## Key Concepts

### 1. Repository Pattern — Data Access Abstraction

```
BaseRepository (generic CRUD)
    ├── ProductRepository (+ findBySlug, findActiveProducts, updateStock)
    ├── CategoryRepository (+ findAllTree, findWithProducts, findBySlug)
    └── UserRepository (+ findByEmail, omit password, updateProfile)
```

The base class provides findAll, findById, create, update, delete, count.
Each child adds model-specific methods.

### 2. Service Layer — Business Logic

Services enforce rules that don't belong in controllers or repositories:
- "Is this slug already taken?" — uniqueness validation
- "Does this category exist?" — referential integrity
- "A category can't be its own parent" — domain logic

### 3. Thin Controllers

Controllers do THREE things only:
1. **Parse** the HTTP request (query params, body, URL params)
2. **Call** the service layer
3. **Send** the HTTP response

No business logic, no database calls.

### 4. Module-Level Singletons (Node.js DI)

```typescript
// Node.js — module exports ARE singletons
export const productRepository = new ProductRepository();
export const productService = new ProductService(productRepository, categoryRepository);

// C# — DI container manages lifetime
services.AddSingleton<IProductRepository, ProductRepository>();
services.AddScoped<IProductService, ProductService>();
```

### 5. Route Order Matters

```typescript
// CORRECT — specific before dynamic
router.get('/slug/:slug', getBySlug);  // literal "slug" matches first
router.get('/:id', getById);           // catch-all matches second

// WRONG — dynamic catches everything
router.get('/:id', getById);           // "slug" would be captured as :id!
router.get('/slug/:slug', getBySlug);  // never reached
```

## C# Clean Architecture Comparison

| Node.js / Express | ASP.NET Core |
|---|---|
| `base.repository.ts` | `GenericRepository<T> : IRepository<T>` |
| `product.repository.ts extends BaseRepository` | `ProductRepository : GenericRepository<Product>` |
| `product.service.ts` | `ProductService : IProductService` |
| `product.controller.ts` (functions) | `ProductController : ControllerBase` (class) |
| `product.routes.ts` with `router.get()` | `[HttpGet]`, `[HttpPost]` attributes |
| `routes/index.ts` mounts routers | `app.MapControllers()` with `[Route]` |
| `export const singleton = new Class()` | `services.AddSingleton<T>()` |
| `req.params.id` | Route parameter `Guid id` |
| `req.query.page` | `[FromQuery] int page` |
| `req.body` | `[FromBody] CreateProductDto dto` |
| `sendSuccess(res, data)` | `return Ok(data)` |
| `sendCreated(res, data)` | `return Created(uri, data)` |
| `sendNoContent(res)` | `return NoContent()` |
| `sendError(res, 404, ...)` | `return NotFound()` |
| `try/catch` in each controller | Global exception filter / middleware |
| `Promise.all([q1, q2])` | `Task.WhenAll(t1, t2)` |

---

*Phase 4 complete. Test every endpoint with the curl commands above.*
*Read every comment in the repository, service, and controller files.*

---

# Phase 5 — Input Validation & Error Handling

## What Was Built

```
src/
├── errors/
│   ├── AppError.ts          ← Base error class (statusCode, code, isOperational)
│   ├── NotFoundError.ts     ← 404 — resource not found
│   ├── ConflictError.ts     ← 409 — uniqueness violation (duplicate slug/SKU)
│   ├── ValidationError.ts   ← 400 — Zod schema validation failure (with details[])
│   ├── BadRequestError.ts   ← 400 — generic bad request (circular ref, etc.)
│   └── index.ts             ← Barrel export for all error classes
├── middleware/
│   ├── asyncHandler.ts      ← Wraps async handlers — catches rejected promises
│   ├── errorHandler.ts      ← Global 4-param error middleware — formats all errors
│   └── validate.ts          ← Zod validation middleware factory
├── validators/
│   ├── common.validator.ts  ← Shared schemas: idParam, slugParam, pagination
│   ├── product.validator.ts ← createProduct, updateProduct, getProductsQuery
│   ├── category.validator.ts← createCategory, updateCategory, getCategoryProductsQuery
│   └── user.validator.ts    ← updateUserProfile, getUsersQuery
├── services/
│   ├── product.service.ts   ← UPDATED: throw NotFoundError/ConflictError
│   ├── category.service.ts  ← UPDATED: throw NotFoundError/ConflictError/BadRequestError
│   └── user.service.ts      ← UPDATED: throw NotFoundError
├── controllers/
│   ├── product.controller.ts ← UPDATED: asyncHandler, no try/catch, no manual parsing
│   ├── category.controller.ts← UPDATED: asyncHandler, no try/catch
│   └── user.controller.ts   ← UPDATED: asyncHandler, no try/catch
├── routes/
│   ├── product.routes.ts    ← UPDATED: validate() middleware on each route
│   ├── category.routes.ts   ← UPDATED: validate() middleware on each route
│   └── user.routes.ts       ← UPDATED: validate() middleware on each route
└── app.ts                   ← UPDATED: errorHandler registered after notFound
```

## Error Class Hierarchy

```
Error (native JavaScript)
  └── AppError (statusCode, code, isOperational)
        ├── NotFoundError     (404, 'NOT_FOUND')
        ├── ConflictError     (409, 'CONFLICT')
        ├── ValidationError   (400, 'VALIDATION_ERROR', details[])
        └── BadRequestError   (400, 'BAD_REQUEST')
```

## Request Flow — Before vs After

```
BEFORE (Phase 4):
  Request → Route → Controller (try/catch, manual parseInt, sendError)
                        ↓ error
                   catch block manually formats error response

AFTER (Phase 5):
  Request → Route → validate(zodSchema) → Controller (asyncHandler) → Service → Repo
                        ↓ fail                   ↓ error
                   ValidationError          NotFoundError / ConflictError
                        ↓                        ↓
                   ──────── Global errorHandler catches ALL ────────
                                      ↓
                              Standardized JSON error response
```

## Before vs After Code Comparison

### Service — Throwing Errors

```typescript
// BEFORE (Phase 4) — the statusCode hack
const error = new Error(`Product with id '${id}' not found`);
(error as any).statusCode = 404;  // eslint-disable-line
throw error;

// AFTER (Phase 5) — clean custom error
throw new NotFoundError('Product', id);
// → { statusCode: 404, code: 'NOT_FOUND', message: "Product with id '...' not found" }
```

### Controller — Handling Errors

```typescript
// BEFORE (Phase 4) — try/catch in every handler, manual parsing
export async function getProducts(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;   // manual parsing
    const limit = parseInt(req.query.limit as string, 10) || 10; // manual parsing
    const result = await productService.getProducts({ page, limit });
    sendPaginated(res, result.products, meta);
  } catch (error: any) {
    const statusCode = error.statusCode || 500;  // hack
    sendError(res, statusCode, ...);              // manual formatting
  }
}

// AFTER (Phase 5) — asyncHandler, no try/catch, Zod handles parsing
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, ...filters } = req.query;  // already parsed by Zod!
  const result = await productService.getProducts({ page, limit, ...filters });
  sendPaginated(res, result.products, meta);
  // errors caught by asyncHandler → forwarded to global errorHandler
});
```

### Routes — Validation Middleware

```typescript
// BEFORE (Phase 4) — no validation
router.post('/', createProduct);

// AFTER (Phase 5) — Zod validates body before controller runs
router.post('/', validate({ body: createProductSchema }), createProduct);
```

## Standardized Error Response Shape

Every error now follows this shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "body.name", "message": "Product name is required" },
      { "field": "body.price", "message": "Price must be greater than 0" }
    ]
  }
}
```

For non-validation errors (no details):

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Product with id '550e8400-...' not found"
  }
}
```

## Zod vs FluentValidation Comparison

| Zod (TypeScript) | FluentValidation (C#) |
|---|---|
| `z.string()` | `RuleFor(x => x.Name).NotNull()` |
| `z.string().min(1)` | `RuleFor(x => x.Name).NotEmpty()` |
| `z.string().max(200)` | `RuleFor(x => x.Name).MaximumLength(200)` |
| `z.string().uuid()` | `RuleFor(x => x.Id).Must(BeAValidGuid)` |
| `z.number().positive()` | `RuleFor(x => x.Price).GreaterThan(0)` |
| `z.number().int().min(0)` | `RuleFor(x => x.Stock).GreaterThanOrEqualTo(0)` |
| `z.coerce.number()` | `[FromQuery] int page` (auto-converts) |
| `.default(10)` | `= 10` (default parameter value) |
| `.optional()` | nullable property |
| `.partial()` | Separate DTO with all nullable props |
| `.merge()` | Class inheritance or composition |
| `z.enum(['A', 'B'])` | `RuleFor(x => x.Role).IsInEnum()` |
| `safeParse()` | `validator.Validate()` |
| `validate()` middleware | `AddFluentValidationAutoValidation()` |

## Key Concepts

### 1. Operational vs Programming Errors

```
Operational errors (isOperational = true):
  - Bad user input (ValidationError)
  - Resource not found (NotFoundError)
  - Duplicate values (ConflictError)
  → SAFE to show to client. Expected, handled gracefully.

Programming errors (isOperational = false):
  - TypeError, ReferenceError
  - Database connection failures
  - Bugs in our code
  → HIDE from client. Log for debugging, show generic "Internal Error".
```

### 2. asyncHandler — The try/catch Killer

```typescript
// asyncHandler wraps your async function and catches rejected promises:
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// next(error) → Express skips to the error handler middleware
// No more try/catch in ANY controller!
```

### 3. Express Error Handler Signature

```typescript
// Express identifies error handlers by their 4 parameters:
function errorHandler(err, req, res, next) { ... }  // 4 params = error handler
function middleware(req, res, next) { ... }          // 3 params = regular middleware

// The _next param must exist even if unused — Express checks argument count!
```

### 4. Zod Coercion for Query Strings

```typescript
// ALL query string values are STRINGS in Express:
// ?page=2 → req.query.page = "2" (string, not number!)

// z.coerce.number() converts string → number:
z.coerce.number().int().min(1).default(1)
// "2" → 2, undefined → 1, "abc" → validation error

// This eliminates: parseInt(req.query.page as string, 10) || 1
```

### 5. Prisma Error Mapping

```
Prisma P2002 → ConflictError (409) — unique constraint violation
Prisma P2025 → NotFoundError (404) — record not found
Other errors → 500 Internal Error
```

## C# Error Handling Comparison

| Node.js / Express | ASP.NET Core |
|---|---|
| `AppError` base class | `ApiException` base class |
| `throw new NotFoundError(...)` | `throw new NotFoundException(...)` |
| `asyncHandler` wrapper | Framework auto-catches async exceptions |
| `errorHandler` middleware (4 params) | `UseExceptionHandler()` / Global exception filter |
| `validate()` middleware + Zod | `[ApiController]` auto-validation / FluentValidation |
| `ValidationError` with details[] | `ProblemDetails` with Errors dict |
| `isOperational` flag | Exception type hierarchy |
| `Object.setPrototypeOf` fix | Not needed — C# inheritance "just works" |

## Test It Yourself

```bash
npm run dev

# ── Validation Tests ──────────────────────────────────────────────────────

# Empty body → 400 with per-field errors
curl -X POST http://localhost:3000/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{}'

# Negative price → 400 validation error
curl -X POST http://localhost:3000/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"test","price":-5,"stock":10}'

# Invalid UUID in URL → 400 validation error
curl http://localhost:3000/api/v1/products/not-a-uuid

# Invalid page number → 400 validation error
curl "http://localhost:3000/api/v1/products?page=0"

# Invalid role filter → 400 validation error
curl "http://localhost:3000/api/v1/users?role=SUPERADMIN"

# ── Error Handling Tests ──────────────────────────────────────────────────

# Non-existent UUID → 404 NotFoundError
curl http://localhost:3000/api/v1/products/00000000-0000-0000-0000-000000000000

# Duplicate slug → 409 ConflictError (create first, then try again)
curl -X POST http://localhost:3000/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","slug":"iphone-15-pro","price":999,"stock":10}'

# ── Happy Path (still works!) ─────────────────────────────────────────────

curl http://localhost:3000/api/v1/products
curl http://localhost:3000/api/v1/categories
curl http://localhost:3000/api/v1/users
```

---

*Phase 5 complete. All errors are now handled by the global errorHandler.*
*All input is validated by Zod before reaching controllers.*
*Read every comment in the new error, middleware, and validator files.*

---

# Phase 6 — Authentication & Authorization

## What Was Built

```
src/
├── errors/
│   ├── UnauthorizedError.ts   ← 401 — missing/invalid token
│   ├── ForbiddenError.ts      ← 403 — wrong role
│   └── index.ts               ← UPDATED: exports new error classes
├── middleware/
│   ├── authenticate.ts        ← Verify JWT, set req.user
│   └── authorize.ts           ← Role-based access control factory
├── utils/
│   ├── password.ts            ← bcrypt hash + compare helpers
│   └── jwt.ts                 ← Generate/verify access + refresh tokens
├── validators/
│   └── auth.validator.ts      ← Zod schemas: register, login, refresh
├── services/
│   └── auth.service.ts        ← register, login, refresh, getMe logic
├── controllers/
│   └── auth.controller.ts     ← HTTP handlers for auth endpoints
├── repositories/
│   └── user.repository.ts     ← UPDATED: +findByEmailWithPassword, +createUser
├── routes/
│   ├── auth.routes.ts         ← Public + protected auth routes
│   ├── user.routes.ts         ← UPDATED: all routes now require auth
│   └── index.ts               ← UPDATED: mounts /auth router
├── config/
│   └── env.ts                 ← UPDATED: +JWT_SECRET, +JWT_REFRESH_SECRET, +BCRYPT_ROUNDS
├── types/
│   └── express.d.ts           ← UPDATED: +req.user (userId, email, role)
└── .env / .env.example        ← UPDATED: auth env vars
```

## JWT Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TOKEN LIFECYCLE                                   │
│                                                                         │
│  ┌──────────┐   POST /auth/register   ┌──────────────────────────────┐ │
│  │  Client   │ ─────────────────────→ │  Auth Service                │ │
│  │           │   or POST /auth/login   │  1. Validate credentials     │ │
│  │           │ ←───────────────────── │  2. Hash/compare password    │ │
│  │           │   { accessToken (15m),  │  3. Generate JWT tokens      │ │
│  │           │     refreshToken (7d),  └──────────────────────────────┘ │
│  │           │     user }                                               │
│  │           │                                                          │
│  │           │   GET /api/v1/users     ┌──────────────────────────────┐ │
│  │           │ ─────────────────────→ │  authenticate middleware     │ │
│  │           │   Authorization:        │  1. Extract Bearer token     │ │
│  │           │   Bearer <accessToken>  │  2. jwt.verify(token,secret) │ │
│  │           │                         │  3. Set req.user             │ │
│  │           │                         └──────────┬───────────────────┘ │
│  │           │                                    ↓                     │
│  │           │                         ┌──────────────────────────────┐ │
│  │           │                         │  authorize('ADMIN')          │ │
│  │           │                         │  Check req.user.role         │ │
│  │           │                         └──────────┬───────────────────┘ │
│  │           │                                    ↓                     │
│  │           │ ←─────────────────────  Controller → Service → DB       │
│  │           │   200 OK + data                                         │
│  │           │                                                          │
│  │           │   Access token expired!  ┌──────────────────────────────┐ │
│  │           │   POST /auth/refresh    │  Auth Service                │ │
│  │           │ ─────────────────────→ │  1. Verify refresh token     │ │
│  │           │   { refreshToken }      │  2. Check user still exists  │ │
│  │           │ ←───────────────────── │  3. Generate NEW token pair  │ │
│  │           │   { accessToken (new),  └──────────────────────────────┘ │
│  │           │     refreshToken (new) }                                 │
│  └──────────┘     ↑ TOKEN ROTATION                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Middleware Chain — Protected Routes

```
Request
  ↓
authenticate  →  "Who are you?"   → reads Authorization: Bearer <token>
  │                                  → jwt.verify() → set req.user
  │ fail → 401 UnauthorizedError     → next()
  ↓
authorize     →  "What role?"     → checks req.user.role vs allowed roles
  │                                  → next()
  │ fail → 403 ForbiddenError
  ↓
validate      →  "Valid input?"   → Zod schema on body/params/query
  │                                  → next()
  │ fail → 400 ValidationError
  ↓
controller    →  Business logic   → calls service → sends response
```

## API Endpoints — Auth (5 new)

| Method | Path | Auth? | Description |
|--------|------|-------|-------------|
| POST | `/api/v1/auth/register` | No | Create account + get tokens |
| POST | `/api/v1/auth/login` | No | Authenticate + get tokens |
| POST | `/api/v1/auth/refresh` | No | Exchange refresh → new tokens |
| POST | `/api/v1/auth/logout` | Yes | Client-side logout hint |
| GET | `/api/v1/auth/me` | Yes | Get current user profile |

## Updated Endpoints — Users (now protected)

| Method | Path | Auth? | Role? | Description |
|--------|------|-------|-------|-------------|
| GET | `/api/v1/users` | Yes | ADMIN | List users (paginated) |
| GET | `/api/v1/users/:id` | Yes | Any | Get user by ID |
| PUT | `/api/v1/users/:id` | Yes | Any | Update user profile |

## How bcrypt Works

```
PASSWORD HASHING (registration):
  "password123"
       ↓
  bcrypt.genSalt(10)  →  random 22-char salt
       ↓
  bcrypt.hash(password, salt)
       ↓
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
   │   │  │                      │
   │   │  └─ 22-char salt        └─ 31-char hash
   │   └─ 10 rounds (2^10 = 1024 iterations)
   └─ bcrypt version 2b

PASSWORD VERIFICATION (login):
  submitted: "password123"
  stored:    "$2b$10$N9qo8uLOickgx2ZMRZoMye..."
       ↓
  bcrypt.compare(submitted, stored)
    1. Extract salt from stored hash
    2. Hash submitted password with SAME salt
    3. Compare hashes (constant-time to prevent timing attacks)
       ↓
  true (match!) or false (wrong password)
```

## How JWT Works

```
TOKEN STRUCTURE:
  eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxMjMifQ.signature
  │                     │                         │
  Header (base64)       Payload (base64)          Signature (HMAC-SHA256)

Header:   { "alg": "HS256", "typ": "JWT" }
Payload:  { "userId": "abc", "email": "x@y.com", "role": "ADMIN", "iat": ..., "exp": ... }
Signature: HMAC-SHA256(header + "." + payload, SECRET_KEY)

⚠️ NOT ENCRYPTED — anyone can decode and read the payload!
   The signature only proves nobody MODIFIED the data.
   Never put secrets (passwords, credit cards) in a JWT.

VERIFICATION:
  1. Split token into header.payload.signature
  2. Recompute: HMAC-SHA256(header + "." + payload, SECRET_KEY)
  3. Compare with token's signature (constant-time)
  4. Check exp > now (not expired)
  → If all pass: token is authentic and fresh ✓
```

## Two-Token Strategy

```
ACCESS TOKEN (short-lived: 15 minutes)
  ✓ Sent with every API request (Authorization header)
  ✓ Stateless verification (no database lookup)
  ✓ If stolen, damage limited to 15 minutes
  ✗ Can't be revoked without a blacklist (Phase 9 adds this)

REFRESH TOKEN (long-lived: 7 days)
  ✓ Used ONLY to get a new access token
  ✓ Signed with a DIFFERENT secret (defense in depth)
  ✓ Token rotation: new refresh token each time (old one is "consumed")
  ✗ Longer exposure window (mitigated by rotation)

WHY SEPARATE SECRETS?
  If the access secret leaks (from a log, error message, etc.),
  the attacker STILL can't forge refresh tokens. Each secret
  protects a different "zone" of the auth system.
```

## Security Design Decisions

| Decision | Why |
|----------|-----|
| Same error for "email not found" AND "wrong password" | Prevents user enumeration attacks |
| Login password validates `.min(1)` not `.min(8)` | Don't leak password policy to attackers |
| Token rotation on refresh | Old refresh token becomes invalid after use |
| Separate secrets for access/refresh | Leaked access secret doesn't compromise refresh |
| Client-side logout (for now) | No server blacklist yet — Phase 9 Redis adds this |
| Password omitted at repository level | Defense in depth — can't accidentally expose it |

## C# Authentication Comparison

| Node.js / Express | ASP.NET Core |
|---|---|
| `bcryptjs` hash/compare | `PasswordHasher<T>` (PBKDF2) or BCrypt.Net |
| `jsonwebtoken` sign/verify | `JwtSecurityTokenHandler` |
| `authenticate` middleware | `AddAuthentication().AddJwtBearer()` (automatic) |
| `authorize('ADMIN')` middleware | `[Authorize(Roles = "ADMIN")]` attribute |
| `req.user.userId` | `HttpContext.User.FindFirst("userId")` |
| `validate({ body: schema })` | `[ApiController]` auto-validation |
| Manual `Bearer` header parsing | Framework parses it automatically |
| `express.d.ts` type augmentation | `ClaimsPrincipal` built-in |
| Module singleton DI | `services.AddScoped<IAuthService, AuthService>()` |

## Test with curl

```bash
npm run dev

# ─── Registration ──────────────────────────────────────────────────────────

# Register a new user → 201 with user + tokens
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test","lastName":"User"}'

# Duplicate email → 409 ConflictError
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test","lastName":"User"}'

# Missing fields → 400 ValidationError
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{}'

# Short password → 400 ValidationError
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","password":"short","firstName":"A","lastName":"B"}'

# ─── Login ─────────────────────────────────────────────────────────────────

# Login → 200 with tokens
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Wrong password → 401 (same message as wrong email — security!)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'

# Non-existent email → 401 (same message — prevents enumeration)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","password":"anything"}'

# ─── Protected Routes ─────────────────────────────────────────────────────

# Save a token from login for testing:
# TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
#   -H "Content-Type: application/json" \
#   -d '{"email":"test@example.com","password":"password123"}' | jq -r '.data.accessToken')

# GET /auth/me WITHOUT token → 401
curl http://localhost:3000/api/v1/auth/me

# GET /auth/me WITH token → 200 user profile
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer ACCESS_TOKEN_HERE"

# GET /users without token → 401
curl http://localhost:3000/api/v1/users

# GET /users as CUSTOMER → 403 Forbidden
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer CUSTOMER_TOKEN_HERE"

# GET /users as ADMIN → 200 user list
# (Log in with admin@storekit.dev from seed data)
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"

# ─── Token Refresh ────────────────────────────────────────────────────────

# Use the refresh token from login:
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"REFRESH_TOKEN_HERE"}'

# Invalid refresh token → 401
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"invalid-token"}'

# ─── Logout ───────────────────────────────────────────────────────────────

# Logout (requires auth) → 200
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer ACCESS_TOKEN_HERE"

# Logout without token → 401
curl -X POST http://localhost:3000/api/v1/auth/logout
```

## Environment Variables Added

```env
# REQUIRED — fail-fast if missing
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_REFRESH_SECRET=another-super-secret-key-min-32-chars

# OPTIONAL — have sensible defaults
JWT_EXPIRY=15m              # access token lifetime (default: 15m)
JWT_REFRESH_EXPIRY=7d       # refresh token lifetime (default: 7d)
BCRYPT_ROUNDS=10            # salt rounds (default: 10)
```

---

*Phase 6 complete. All endpoints are now either public or protected.*
*The user routes now require authentication; listing users requires ADMIN role.*
*Read every comment in the new auth files — especially password.ts and jwt.ts.*

---

# Phase 7 — Advanced CRUD & Query Features

## What Was Built

```
Files Created:
  src/utils/slug.ts             ← auto-generate URL-friendly slugs from names
  src/utils/queryBuilder.ts     ← sort parser + cursor pagination builder

Files Modified:
  prisma/schema.prisma          ← added deletedAt to Product (soft delete)
  src/validators/common.validator.ts  ← sortSchema, cursorSchema
  src/validators/product.validator.ts ← sort/cursor in query, patchProductSchema, slug now optional
  src/repositories/product.repository.ts ← sorting, cursor pagination, soft delete filter
  src/services/product.service.ts        ← auto-slug generation, soft delete
  src/controllers/product.controller.ts  ← PATCH handler, cursor pagination response
  src/routes/product.routes.ts           ← PATCH route added
  src/utils/apiResponse.ts               ← CursorPaginationMeta, sendCursorPaginated
```

## Key Concepts

### 1. Soft Delete — `deletedAt` Timestamp

Instead of permanently deleting products (`DELETE FROM products WHERE id = ?`),
we set `deletedAt = NOW()`. The row stays in the database but is hidden from
all read queries via a `deletedAt: null` filter.

**Why not a boolean `isDeleted`?**
A timestamp gives you WHEN it was deleted (audit trail). A boolean only tells
you IF it was deleted. Same disk cost, more information.

**Why not hard delete?**
- Orders reference products — you'd break FK relationships
- Legal/compliance may require data retention
- Admins accidentally delete things — soft delete is recoverable
- Analytics need historical product data

```
C# equivalent:
  // Global query filter (applied to ALL queries automatically):
  modelBuilder.Entity<Product>().HasQueryFilter(p => p.DeletedAt == null);

  // Soft delete method:
  product.DeletedAt = DateTime.UtcNow;
  await _context.SaveChangesAsync();
```

In Prisma, there's no built-in global query filter like EF Core.
We manually add `deletedAt: null` to every read query. This is more explicit
but also more error-prone (you could forget to add it in a new query).

### 2. Dynamic Sorting — `?sort=price:asc,name:desc`

Clients control sort order via a query string parameter:
```
GET /products?sort=price:asc              → sorted by price ascending
GET /products?sort=price:asc,name:desc    → multi-sort: price first, then name
GET /products                             → default: createdAt:desc (newest first)
```

**Security: Field Whitelist**
Allowed fields: `name`, `price`, `stock`, `createdAt`, `updatedAt`.
Any other field is silently ignored. This prevents:
- Sorting by sensitive fields (`password`, `deletedAt`)
- Prisma errors from unknown fields
- Information leakage via sort order

**How parseSortParam() works:**
```
"price:asc,name:desc"
  → split by ","  → ["price:asc", "name:desc"]
  → split by ":"  → [["price","asc"], ["name","desc"]]
  → validate each → both in whitelist ✓
  → Prisma format → [{ price: 'asc' }, { name: 'desc' }]
```

```
C# equivalent:
  query.OrderBy(p => p.Price).ThenByDescending(p => p.Name)
  // Or with dynamic LINQ: query.OrderBy("Price asc, Name desc")
```

### 3. Cursor-Based Pagination — `?cursor=uuid`

Two pagination modes coexist:

**Offset pagination (default):**
```
GET /products?page=3&limit=10
→ SQL: SELECT * FROM products ... OFFSET 20 LIMIT 10
→ meta: { total: 100, page: 3, totalPages: 10, hasNextPage: true }
```
✅ Supports "jump to page 5"
❌ Slow on large datasets (DB must skip rows)
❌ Inconsistent if data changes between pages

**Cursor pagination (if `cursor` provided):**
```
GET /products?cursor=last-item-id&limit=10
→ SQL: SELECT * FROM products WHERE id > 'cursor-id' ... LIMIT 10
→ meta: { limit: 10, nextCursor: "next-item-id", hasMore: true }
```
✅ Fast on large datasets (index seek, no skip)
✅ Consistent — no missed/duplicate items
❌ No "jump to page 5" — only forward

**Prisma cursor pagination:**
```typescript
prisma.product.findMany({
  cursor: { id: cursorId },
  skip: 1,       // skip the cursor record itself
  take: limit,
})
```

```
C# equivalent:
  var query = _dbSet
    .Where(p => p.Id.CompareTo(cursorId) > 0)
    .OrderBy(p => p.Id)
    .Take(limit);
```

### 4. Auto-Slug Generation

When creating a product, slug is now optional:
```json
POST /products
{ "name": "Wireless Headphones", "price": 49.99, "stock": 100 }
→ slug auto-generated: "wireless-headphones"
```

If the slug is already taken, a numeric suffix is appended:
```
"wireless-headphones"    ← first product
"wireless-headphones-2"  ← second product with same name
"wireless-headphones-3"  ← third
```

The `generateSlug()` utility:
1. Normalizes Unicode (é → e, ñ → n)
2. Lowercases
3. Replaces non-alphanumeric chars with hyphens
4. Collapses consecutive hyphens
5. Trims leading/trailing hyphens

### 5. PATCH vs PUT

Both endpoints exist for semantic correctness:

| HTTP Method | Endpoint | Empty body `{}` | Use case |
|-------------|----------|-----------------|----------|
| PUT | `/products/:id` | ✅ Valid (no-op) | Full replacement |
| PATCH | `/products/:id` | ❌ 400 Error | Partial modification |

Both call the same `updateProduct()` service method. The only difference
is the validation schema: `patchProductSchema` uses `.refine()` to ensure
at least one field is present.

```
C# equivalent:
  [HttpPut("{id}")]
  public IActionResult Put(Guid id, UpdateProductDto dto) { ... }

  [HttpPatch("{id}")]
  public IActionResult Patch(Guid id, JsonPatchDocument<ProductDto> patch) {
    if (patch.Operations.Count == 0) return BadRequest();
    // ...
  }
```

## API Examples

### Sorting
```bash
# Single sort
curl "http://localhost:3000/api/v1/products?sort=price:asc"

# Multi-sort
curl "http://localhost:3000/api/v1/products?sort=price:asc,name:desc"

# Combined with filters
curl "http://localhost:3000/api/v1/products?sort=price:asc&minPrice=10&maxPrice=50"
```

### Cursor Pagination
```bash
# First page (no cursor)
curl "http://localhost:3000/api/v1/products?limit=5"
# Response meta: { "nextCursor": "abc-123", "hasMore": true, "limit": 5 }

# Next page (use nextCursor from previous response)
curl "http://localhost:3000/api/v1/products?limit=5&cursor=abc-123"
```

### Soft Delete
```bash
# Delete (soft)
curl -X DELETE "http://localhost:3000/api/v1/products/PRODUCT_ID"
# Response: { "success": true, "data": { "id": "..." }, "message": "Product soft-deleted successfully" }

# Verify it's gone from listings
curl "http://localhost:3000/api/v1/products"
# Product no longer appears
```

### Auto-Slug + PATCH
```bash
# Create without slug
curl -X POST "http://localhost:3000/api/v1/products" \
  -H "Content-Type: application/json" \
  -d '{"name":"Wireless Headphones","price":49.99,"stock":100}'
# Response: slug is "wireless-headphones"

# PATCH — update only price
curl -X PATCH "http://localhost:3000/api/v1/products/PRODUCT_ID" \
  -H "Content-Type: application/json" \
  -d '{"price":39.99}'

# PATCH with empty body — 400 error
curl -X PATCH "http://localhost:3000/api/v1/products/PRODUCT_ID" \
  -H "Content-Type: application/json" \
  -d '{}'
# Response: 400 VALIDATION_ERROR
```

## New Utility Files

| File | Exports | Purpose |
|------|---------|---------|
| `src/utils/slug.ts` | `generateSlug()` | Convert any string to URL-friendly slug |
| `src/utils/queryBuilder.ts` | `parseSortParam()`, `buildCursorArgs()` | Dynamic sort + cursor pagination for Prisma |

## C# Comparison Summary

| Feature | Node.js/Prisma | C#/EF Core |
|---------|---------------|------------|
| Soft delete filter | Manual `deletedAt: null` in every query | `HasQueryFilter()` — automatic globally |
| Dynamic sort | `parseSortParam()` → Prisma `orderBy` array | Dynamic LINQ or `switch` on sort param |
| Cursor pagination | Prisma `cursor` + `skip: 1` | Manual `WHERE id > cursor ORDER BY id` |
| Slug generation | Custom `generateSlug()` function | NuGet `Slugify` or custom helper |
| PATCH validation | Zod `.refine(obj => keys > 0)` | `JsonPatchDocument` or custom check |

## Environment Variables

No new env variables in Phase 7.

---

*Phase 7 complete. The product API now supports dynamic sorting, cursor pagination, soft deletes, auto-slug generation, and PATCH updates.*
*Every read query filters soft-deleted records. The sort parameter is validated against a field whitelist.*
*When you're ready, say "move to next phase" for Phase 8: File Uploads & Static Assets.*

---

# Phase 8 — File Uploads & Static Assets

## What Was Built

```
src/
├── config/
│   └── env.ts                  ← MODIFIED — added uploadDir, maxFileSize, allowedImageTypes
├── middleware/
│   ├── upload.ts               ← NEW — Multer config (disk storage, file filter, size limits)
│   └── errorHandler.ts         ← MODIFIED — added MulterError handling (CASE 2)
├── utils/
│   └── imageProcessor.ts       ← NEW — Sharp image processing (resize, compress, WebP)
├── services/
│   └── upload.service.ts       ← NEW — upload business logic (process, store, delete)
├── controllers/
│   └── upload.controller.ts    ← NEW — HTTP handlers (uploadProductImages, deleteProductImage)
├── validators/
│   └── upload.validator.ts     ← NEW — Zod schemas (deleteImageBodySchema)
├── routes/
│   ├── upload.routes.ts        ← NEW — route definitions (POST/DELETE /:id/images)
│   └── index.ts                ← MODIFIED — mounted upload routes at /products
├── app.ts                      ← MODIFIED — added express.static() for /uploads
uploads/
├── products/                   ← NEW — product image storage directory
└── avatars/                    ← NEW — avatar image storage directory (future use)
.env.example                    ← MODIFIED — documented new upload env vars
```

## New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/products/:id/images` | Required | Upload product images (multipart/form-data) |
| `DELETE` | `/api/v1/products/:id/images` | Required | Delete a product image by URL |
| `GET` | `/uploads/products/{filename}` | None | Serve uploaded images (static files) |

## Key Concepts

### Multipart/Form-Data vs JSON
Regular API endpoints use `Content-Type: application/json` with JSON bodies.
File uploads use `Content-Type: multipart/form-data` — a different encoding that
supports binary data. Express's built-in JSON parser can't handle this format,
so we use **Multer** to parse it.

```
JSON body:       { "name": "product" }
Multipart body:  ------boundary
                 Content-Disposition: form-data; name="images"; filename="photo.jpg"
                 Content-Type: image/jpeg
                 <raw binary bytes>
                 ------boundary--
```

C# equivalent: `IFormFile` in ASP.NET Core handles this automatically.

### Multer Middleware Pipeline
Multer sits in the middleware chain BEFORE the controller:
```
Request → authenticate → validate(params) → Multer → controller → service
                                              ↑
                                    Parses multipart data,
                                    validates file type/size,
                                    saves to disk → req.files
```

After Multer runs, `req.files` contains an array of file metadata:
- `originalname`: Client's filename (NEVER trust this)
- `filename`: Our safe UUID filename (e.g., `abc123-1699876543210.jpg`)
- `path`: Full filesystem path
- `mimetype`: MIME type (e.g., `image/jpeg`)
- `size`: File size in bytes

### Sharp Image Processing
Sharp is a high-performance image processing library built on libvips (C library).
It's ~5x faster than alternatives like Jimp.

Each uploaded image produces **two versions**:
| Version | Max Size | Quality | Use Case |
|---------|----------|---------|----------|
| Full | 1200×1200px | 80 | Product detail page |
| Thumbnail | 300×300px | 70 | Product listing cards |

Both are converted to **WebP** format (~30% smaller than JPEG at same quality).
The original uploaded file is deleted after processing.

**Resize behavior:**
- `fit: 'inside'` — shrink to fit within the box, preserving aspect ratio
- `withoutEnlargement: true` — never upscale (prevents blurry images)
- A 3000×2000 image → 1200×800 (not stretched to 1200×1200)

C# equivalent: `SixLabors.ImageSharp` with `ResizeMode.Max`.

### Storage Abstraction
The `UploadService` is the **only file** that knows HOW files are stored.
Right now it uses local disk (`./uploads/`). To switch to cloud storage
(S3, Cloudinary), only this service needs to change:

```
Local:  /uploads/products/abc123.webp
S3:     https://bucket.s3.amazonaws.com/products/abc123.webp
CDN:    https://cdn.mystore.com/products/abc123.webp
```

Only `buildImageUrl()` and `urlToFilePath()` need updating.

C# equivalent: `IFileStorageService` interface with `LocalFileStorage` and
`S3FileStorage` implementations swapped via DI.

### Static File Serving
`express.static()` in app.ts serves files from the uploads directory:
```typescript
app.use('/uploads', express.static(path.join(process.cwd(), env.uploadDir)));
```

- `GET /uploads/products/abc123.webp` → serves the file with correct Content-Type
- No authentication required — product images are public
- Placed BEFORE API routes for fast serving (no middleware overhead)

C# equivalent: `app.UseStaticFiles()` with a `PhysicalFileProvider`.

### File Security
1. **UUID filenames** — prevents path traversal attacks (`../../etc/passwd`)
2. **MIME type whitelist** — only `image/jpeg`, `image/png`, `image/webp` accepted
3. **File size limit** — default 5MB, configurable via `MAX_FILE_SIZE`
4. **URL prefix validation** — delete requests must have URLs starting with `/uploads/`
5. **Sharp validation** — if it's not a real image, Sharp throws during processing

### MulterError Handling
Multer throws `MulterError` with specific codes:
| Code | Meaning | User Message |
|------|---------|--------------|
| `LIMIT_FILE_SIZE` | File exceeds max size | "File too large. Maximum size is 5MB" |
| `LIMIT_FILE_COUNT` | Too many files | "Too many files. Maximum is 5 files per upload" |
| `LIMIT_UNEXPECTED_FILE` | Wrong field name | "Use 'images' for product images" |

These are caught in the global error handler (CASE 2) and return clean 400 responses.

## C# Comparisons

| Node.js (Express + Multer + Sharp) | ASP.NET Core |
|---|---|
| `multer({ storage: diskStorage(...) })` | `IFormFile` (built into framework) |
| `multer.array('images', 5)` | `List<IFormFile> images` parameter |
| `req.files` | `Request.Form.Files` |
| `sharp(input).resize().webp().toFile()` | `Image.Load().Mutate(x => x.Resize()).SaveAsWebp()` |
| `express.static('./uploads')` | `app.UseStaticFiles(new StaticFileOptions {...})` |
| `MulterError` handling in errorHandler | `BadHttpRequestException` or `RequestSizeLimitExceededException` |
| `fs.unlink()` | `File.Delete()` |
| `crypto.randomUUID()` | `Guid.NewGuid()` |

## Testing the Endpoints

### Upload Images
```bash
# Upload 2 images to a product
curl -X POST http://localhost:3000/api/v1/products/<product-id>/images \
  -H "Authorization: Bearer <token>" \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg"

# Response:
# {
#   "success": true,
#   "data": [
#     { "url": "/uploads/products/abc123.webp", "thumbnailUrl": "/uploads/products/abc123-thumb.webp" },
#     { "url": "/uploads/products/def456.webp", "thumbnailUrl": "/uploads/products/def456-thumb.webp" }
#   ],
#   "message": "2 image(s) uploaded successfully"
# }
```

### View an Image
```bash
# Full-size image (served by express.static)
curl http://localhost:3000/uploads/products/abc123.webp --output image.webp

# Thumbnail
curl http://localhost:3000/uploads/products/abc123-thumb.webp --output thumb.webp
```

### Delete an Image
```bash
curl -X DELETE http://localhost:3000/api/v1/products/<product-id>/images \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "imageUrl": "/uploads/products/abc123.webp" }'

# Response:
# { "success": true, "data": { "imageUrl": "/uploads/products/abc123.webp" }, "message": "Image deleted successfully" }
```

### Error Cases
```bash
# Upload non-image file → 400
curl -X POST .../images -F "images=@document.pdf"
# → { "error": { "code": "BAD_REQUEST", "message": "File type 'application/pdf' is not allowed..." } }

# Upload file too large → 400
curl -X POST .../images -F "images=@huge-photo.jpg"
# → { "error": { "code": "FILE_UPLOAD_ERROR", "message": "File too large. Maximum size is 5MB" } }

# Upload without files → 400
curl -X POST .../images
# → { "error": { "code": "BAD_REQUEST", "message": "No image files provided..." } }
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UPLOAD_DIR` | No | `./uploads` | Directory for storing uploaded files |
| `MAX_FILE_SIZE` | No | `5242880` (5MB) | Maximum file size in bytes |
| `ALLOWED_IMAGE_TYPES` | No | `image/jpeg,image/png,image/webp` | Comma-separated allowed MIME types |

## New Dependencies

| Package | Purpose | C# Equivalent |
|---------|---------|---------------|
| `multer` | Multipart form-data parsing (file uploads) | `IFormFile` (built-in) |
| `sharp` | Image processing (resize, compress, format conversion) | `SixLabors.ImageSharp` |
| `@types/multer` | TypeScript types for multer | N/A |
| `@types/sharp` | TypeScript types for sharp | N/A |

---

*Phase 8 complete. Products can now have images uploaded, processed (resized + WebP), and served statically.*
*The upload infrastructure is local-first but designed for easy cloud migration — only one service file needs changing.*
*When you're ready, say "move to next phase" for Phase 9: Caching with Redis.*

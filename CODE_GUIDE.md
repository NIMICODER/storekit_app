# StoreKit API — Code Guide

A quick-reference guide to every pattern, concept, and C# comparison in this codebase.
Organized by module — use this when you need to understand _why_ something is built a certain way.

> For phase-by-phase build history, see [PHASE_NOTES.md](./PHASE_NOTES.md).

---

## Table of Contents

- [Project Architecture](#project-architecture)
- [Config & Environment](#config--environment)
- [Express & Middleware](#express--middleware)
- [Routing](#routing)
- [Error Handling](#error-handling)
- [Validation (Zod)](#validation-zod)
- [Database & ORM (Prisma)](#database--orm-prisma)
- [Repository Pattern](#repository-pattern)
- [Service Layer](#service-layer)
- [Authentication & Authorization](#authentication--authorization)
- [File Uploads](#file-uploads)
- [Utilities](#utilities)
- [C# ↔ Node.js Cheat Sheet](#c--nodejs-cheat-sheet)

---

## Project Architecture

```
Request → Middleware Pipeline → Route → Controller → Service → Repository → Database
                                            ↓
                                     Sends HTTP response

Each layer has one job:
  Controller  → Parse HTTP request, call service, send response (THIN)
  Service     → Business logic, validation rules, orchestration
  Repository  → Database queries (Prisma), no business logic
```

### Why separate app.ts and server.ts?

- `app.ts` = "what does the app do?" — middleware, routes, error handling
- `server.ts` = "how does the app run?" — port binding, graceful shutdown, process signals
- Tests import `app` directly without starting a real HTTP server

**C#:** `Program.cs` handles both, but the builder pattern separates configuration from startup.

---

## Config & Environment

**File:** `src/config/env.ts`

### How it works

- `dotenv.config()` loads `.env` file into `process.env` (dev only — production injects vars directly)
- `getRequiredEnv(key)` — throws at startup if missing (fail-fast design)
- `getOptionalEnv(key, default)` — returns default if not set
- All values exported as a single typed `env` object with `as const`

### Why fail-fast?

A missing `DATABASE_URL` should crash on startup with a clear error, not silently fail mid-request when the first DB query runs.

**C#:** Similar to `IOptions<AppSettings>` + `appsettings.json`. The difference: ASP.NET does binding/validation automatically; in Node.js we wire it manually.

---

## Express & Middleware

**File:** `src/app.ts`

### Middleware pipeline (order matters!)

```
1. requestLogger    → assign requestId, log every request
2. helmet()         → set security HTTP headers (X-Frame-Options, HSTS, etc.)
3. cors()           → allow cross-origin requests
4. express.json()   → parse JSON bodies → req.body
5. express.urlencoded() → parse form-encoded bodies
6. express.static() → serve uploaded files from /uploads
7. API routes       → /api/v1/...
8. notFound         → catch unmatched routes → 404
9. errorHandler     → catch all thrown errors → JSON response (MUST be last)
```

### Key middleware concepts

**Middleware signature:** `(req, res, next) => void`
- Call `next()` to pass to the next middleware
- Call `next(error)` to jump to the error handler
- Don't call `next()` if you send a response (double-response error)

**Error handler signature:** `(err, req, res, next) => void`
- Express identifies error handlers by having **4 parameters** (not 3)
- Must be registered LAST in the pipeline

**C#:** Middleware is registered with `app.Use()` / `app.UseMiddleware<T>()`. Error handling uses `app.UseExceptionHandler()`. ASP.NET's pipeline works the same way — order matters.

### Request Logger (`src/middleware/requestLogger.ts`)

- Assigns `req.requestId` (UUID) and `req.startTime` to every request
- Listens for the `finish` event on the response to log duration
- Uses TypeScript declaration merging (`src/types/express.d.ts`) to add custom properties to `Request`

**C#:** Similar to ASP.NET's `ILogger` with `IHttpContextAccessor` for request-scoped data.

### asyncHandler (`src/middleware/asyncHandler.ts`)

Express doesn't catch async errors by default — if an async handler throws, the promise rejects silently and the request hangs forever.

```typescript
// Without asyncHandler: need try/catch in EVERY handler
router.get('/', async (req, res, next) => {
  try {
    const data = await service.getData();
    res.json(data);
  } catch (error) {
    next(error); // must manually forward
  }
});

// With asyncHandler: automatic catch + forward
export const getData = asyncHandler(async (req, res) => {
  const data = await service.getData();
  res.json(data);
});
```

**C#:** Not needed — ASP.NET automatically awaits async controller methods and catches exceptions.

---

## Routing

**Files:** `src/routes/index.ts`, `src/routes/*.routes.ts`

### Route aggregator pattern

`routes/index.ts` is the "routing table" — it imports all feature routers and mounts them:

```typescript
router.use('/products', productRouter);    // /api/v1/products/*
router.use('/categories', categoryRouter); // /api/v1/categories/*
router.use('/auth', authRouter);           // /api/v1/auth/*
```

URL composition: `app prefix + aggregator path + router path`
```
'/api/v1' + '/products' + '/:id' = GET /api/v1/products/:id
```

### Route order matters

Express matches top-to-bottom, first match wins:
```typescript
router.get('/slug/:slug', ...); // MUST be before /:id
router.get('/:id', ...);        // Otherwise "slug" would match as an :id
```

**C#:** Similar to `app.MapGroup("/api/v1").MapGroup("/products")`. ASP.NET uses attribute routing `[Route("api/v1/products")]` which doesn't have ordering issues.

---

## Error Handling

**Files:** `src/errors/*.ts`, `src/middleware/errorHandler.ts`

### Custom error hierarchy

```
Error (built-in)
  └── AppError (base — has statusCode, code, isOperational)
        ├── BadRequestError     → 400 BAD_REQUEST
        ├── UnauthorizedError   → 401 UNAUTHORIZED
        ├── ForbiddenError      → 403 FORBIDDEN
        ├── NotFoundError       → 404 NOT_FOUND
        ├── ConflictError       → 409 CONFLICT
        └── ValidationError     → 422 VALIDATION_ERROR (has details array)
```

### Why `Object.setPrototypeOf(this, new.target.prototype)` in AppError?

TypeScript/ES6 classes that extend built-in classes (like `Error`) break `instanceof` checks. This line fixes the prototype chain so `err instanceof AppError` works correctly.

### Global error handler cases

1. **AppError** — our custom errors (operational, safe to show)
2. **MulterError** — file upload errors (LIMIT_FILE_SIZE, LIMIT_FILE_COUNT)
3. **Prisma P2002** — unique constraint violation → 409
4. **Prisma P2025** — record not found → 404
5. **Unknown** — unexpected errors → 500 (log full error, send generic message in production)

**C#:** Similar to a global exception filter `IExceptionFilter` or `app.UseExceptionHandler()`.

---

## Validation (Zod)

**Files:** `src/validators/*.ts`, `src/middleware/validate.ts`

### How validation works

1. Define a Zod schema for body, params, or query
2. Apply `validate({ body: schema })` middleware to the route
3. Middleware parses the data — if invalid, throws `ValidationError` with field-level details
4. If valid, the parsed+typed data replaces `req.body`/`req.params`/`req.query`

```typescript
// Route
router.post('/', validate({ body: createProductSchema }), createProduct);

// Controller — req.body is already validated and typed
export const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  sendCreated(res, product);
});
```

### Key Zod patterns

```typescript
z.string().uuid()           // must be a valid UUID
z.coerce.number()           // converts "100" → 100 (for query params)
z.string().optional()       // field is optional
.default(true)              // use true if undefined
.partial()                  // make all fields optional (for updates)
.refine(fn, msg)            // custom validation (e.g., "at least 1 field required")
.merge(otherSchema)         // combine two schemas
```

### Zod v4 note

Zod v4 uses `error:` instead of `required_error:` for custom error messages. Also use `ZodType` not `ZodSchema`.

### Query params are always strings

Express query params (`req.query`) are always strings. Use `z.coerce.number()` to convert them:
```
?page=2  →  req.query.page = "2" (string)
After Zod:  req.query.page = 2 (number)
```

**C#:** Similar to FluentValidation or Data Annotations. ASP.NET's `[FromQuery]` auto-converts types; Express + Zod achieves the same with `z.coerce`.

---

## Database & ORM (Prisma)

**File:** `src/config/database.ts`, `prisma/schema.prisma`

### Prisma v7 specifics

- Requires a **driver adapter** (`@prisma/adapter-pg` + `pg` package)
- Generated client output: `src/generated/prisma/client` (import from `/client`, not `/index`)
- `prisma.config.ts` handles the datasource URL (not in `schema.prisma`)
- After schema changes: run `npx prisma generate` to regenerate client types

### Singleton pattern for Prisma

```typescript
// database.ts creates ONE PrismaClient instance for the entire app
const prisma = new PrismaClient({ adapter });
export { prisma };
```

Why singleton? Database connections are expensive. One client manages a connection pool.

**C#:** Similar to `services.AddDbContext<AppDbContext>()` — EF Core manages the pool internally.

---

## Repository Pattern

**Files:** `src/repositories/*.ts`

### BaseRepository

Generic CRUD operations using Prisma's delegate pattern:

```typescript
class BaseRepository<TDelegate> {
  constructor(protected delegate: TDelegate) {}

  findAll(options?)     // SELECT * with pagination
  findById(id)          // SELECT WHERE id = ?
  create(data)          // INSERT
  update(id, data)      // UPDATE WHERE id = ?
  delete(id)            // DELETE WHERE id = ?
  count(where?)         // COUNT
}
```

Each entity repository extends `BaseRepository` and adds entity-specific queries.

### Password omission

The `UserRepository` always omits the `password` field via Prisma's `omit` option. The only exception is `findByEmailWithPassword()` which is used exclusively during authentication.

### Soft delete (Product)

Products use `deletedAt DateTime?` for soft delete:
- All read queries include `where: { deletedAt: null }` to filter deleted records
- `softDelete(id)` sets `deletedAt` to current timestamp
- `findBySlugIncludeDeleted()` checks against ALL products (including deleted) for uniqueness

**C#:** Similar to the Repository pattern with `IRepository<T>`. In EF Core, you'd use `IQueryable` with global query filters for soft delete.

---

## Service Layer

**Files:** `src/services/*.ts`

### What services do

- Enforce business rules (uniqueness checks, existence validation)
- Orchestrate repository calls
- Throw custom errors (`NotFoundError`, `ConflictError`)
- Keep controllers thin and repositories pure

### Dependency injection (Node.js style)

```typescript
class ProductService {
  constructor(
    private productRepo: typeof productRepository,
    private categoryRepo: typeof categoryRepository,
  ) {}
}

// Module-level singleton — the module system IS the DI container
export const productService = new ProductService(productRepository, categoryRepository);
```

**C#:** `services.AddScoped<IProductService, ProductService>()` — ASP.NET's DI container manages this. In Node.js, we import singletons directly.

---

## Authentication & Authorization

**Files:** `src/middleware/authenticate.ts`, `src/middleware/authorize.ts`, `src/services/auth.service.ts`, `src/utils/jwt.ts`, `src/utils/password.ts`

### Two-token JWT strategy

```
Login → Returns { accessToken (15m), refreshToken (7d) }

Access token:  Short-lived, sent in Authorization header on every request
Refresh token: Long-lived, used to get a new access token when it expires
```

Separate secrets for access and refresh tokens — if one leaks, the other is still safe.

### Token rotation

When refreshing, the old refresh token is consumed and a new one is issued. This prevents replay attacks — if an attacker steals a refresh token, the real user's next refresh invalidates it.

### Middleware chain

```
authenticate → Verify JWT, attach req.user (userId, email, role)
authorize(...roles) → Check if req.user.role is in the allowed list
```

```typescript
// Protect a route — must be logged in
router.get('/me', authenticate, getMe);

// Protect with role check — must be ADMIN
router.get('/users', authenticate, authorize('ADMIN'), getUsers);
```

### Password hashing (bcrypt)

```
bcrypt.hash(password, rounds) → "$2b$10$salt22chars...hash31chars..."
bcrypt.compare(plain, hashed) → true/false
```

`rounds` controls work factor: 10 ≈ 100ms, 12 ≈ 300ms. Higher = slower brute force.

**C#:** ASP.NET uses `PasswordHasher<User>` with PBKDF2 (not bcrypt). JWT setup uses `AddAuthentication().AddJwtBearer()` with `TokenValidationParameters`.

---

## File Uploads

**Files:** `src/middleware/upload.ts`, `src/utils/imageProcessor.ts`, `src/services/upload.service.ts`

### Multipart/form-data vs JSON

Regular API endpoints use `Content-Type: application/json`.
File uploads use `Content-Type: multipart/form-data` — a different encoding that supports binary data.

Express's JSON parser can't handle multipart. **Multer** is the standard Express middleware for it.

```
JSON body:       { "name": "product" }
Multipart body:  ------boundary
                 Content-Disposition: form-data; name="images"; filename="photo.jpg"
                 Content-Type: image/jpeg
                 <raw binary bytes>
                 ------boundary--
```

### Multer middleware chain

```
Request → authenticate → validate(params) → Multer → controller → service
                                              ↑
                                    Parses multipart data,
                                    validates file type/size,
                                    saves to disk → req.files
```

After Multer runs, `req.files` is an array of file metadata:
- `originalname` — client's filename (NEVER trust this)
- `filename` — our safe UUID filename
- `path` — full filesystem path
- `mimetype` — MIME type (e.g., `image/jpeg`)
- `size` — file size in bytes

### Image processing (Sharp)

Each uploaded image produces 2 WebP versions:
| Version | Max Size | Quality | Use Case |
|---------|----------|---------|----------|
| Full | 1200×1200px | 80 | Product detail page |
| Thumbnail | 300×300px | 70 | Product listing cards |

Processing happens on upload (not on request) — simpler, no runtime CPU cost.

**Resize behavior:**
- `fit: 'inside'` — shrink to fit within the box, preserving aspect ratio
- `withoutEnlargement: true` — never upscale small images

### Storage abstraction

`UploadService` is the ONLY file that knows HOW files are stored. To switch from local disk to S3/Cloudinary, only two private methods need changing:

```typescript
buildImageUrl(subDir, filename)  // local: /uploads/products/abc.webp → S3: https://bucket.s3.../abc.webp
urlToFilePath(url)               // reverse of above
```

### Security measures

1. **UUID filenames** — prevents path traversal attacks (`../../etc/passwd`)
2. **MIME type whitelist** — only `image/jpeg`, `image/png`, `image/webp`
3. **File size limit** — configurable via `MAX_FILE_SIZE` (default 5MB)
4. **URL prefix validation** — delete requests must have URLs starting with `/uploads/`
5. **Sharp validation** — if the file isn't a real image, Sharp throws during processing

**C#:** File uploads use `IFormFile` (built-in). Image processing uses `SixLabors.ImageSharp`. Static files use `app.UseStaticFiles()`.

---

## Utilities

### API Response Helpers (`src/utils/apiResponse.ts`)

Every endpoint returns one of three shapes:

```typescript
// Success
{ success: true, data: T, message?: string }

// Paginated list (offset)
{ success: true, data: T[], meta: { total, page, limit, totalPages, hasNextPage, hasPrevPage } }

// Paginated list (cursor)
{ success: true, data: T[], meta: { limit, nextCursor, hasMore } }

// Error (from errorHandler)
{ success: false, error: { code, message, details? } }
```

### Slug Generation (`src/utils/slug.ts`)

`generateSlug("Wireless Headphones")` → `"wireless-headphones"`

Uniqueness is handled by the service layer: tries the base slug, then appends `-2`, `-3`, etc.

### Query Builder (`src/utils/queryBuilder.ts`)

Parses sort strings and builds Prisma orderBy:

```
?sort=price:asc,name:desc
→ [{ price: 'asc' }, { name: 'desc' }]
```

Fields are validated against a whitelist (`ALLOWED_SORT_FIELDS`) to prevent injection.

### Cursor vs Offset Pagination

**Offset** (`?page=2&limit=10`): Simple, supports page numbers, but slow on large datasets (DB must skip N rows).

**Cursor** (`?cursor=last-item-id`): Fast on large datasets (uses indexed WHERE clause), but no page numbers — only "next page".

Both coexist in this API. The client chooses by including/excluding the `cursor` param.

---

## C# ↔ Node.js Cheat Sheet

| Concept | Node.js / Express | ASP.NET Core |
|---|---|---|
| **App setup** | `express()` | `WebApplication.CreateBuilder()` |
| **Middleware** | `app.use(fn)` | `app.UseMiddleware<T>()` |
| **Config** | `env.ts` + `dotenv` | `IOptions<T>` + `appsettings.json` |
| **Routing** | `Router()` + `app.use(path, router)` | `[Route]` + `[HttpGet]` attributes |
| **DI** | Module singletons (import) | `services.AddScoped<I, T>()` |
| **ORM** | Prisma | Entity Framework Core |
| **Schema** | `schema.prisma` | EF Migrations + DbContext |
| **Validation** | Zod schemas + middleware | FluentValidation / Data Annotations |
| **Error handling** | 4-param middleware `(err, req, res, next)` | `IExceptionFilter` / `UseExceptionHandler` |
| **Async errors** | `asyncHandler` wrapper | Built-in (framework awaits + catches) |
| **Auth** | `jsonwebtoken` + manual middleware | `AddJwtBearer()` + `[Authorize]` |
| **Password hash** | `bcryptjs` (bcrypt) | `PasswordHasher<T>` (PBKDF2) |
| **File upload** | Multer middleware | `IFormFile` (built-in) |
| **Image processing** | Sharp | SixLabors.ImageSharp |
| **Static files** | `express.static()` | `app.UseStaticFiles()` |
| **Request body** | `express.json()` → `req.body` | `[FromBody]` (auto-parsed) |
| **Query params** | `req.query` (always strings) | `[FromQuery]` (auto-converted) |
| **URL params** | `req.params.id` | `[FromRoute] Guid id` |
| **Response** | `res.status(200).json(data)` | `return Ok(data)` |
| **Logging** | `console.log` / custom logger | `ILogger<T>` |
| **Types** | TypeScript interfaces | C# classes / records |
| **Package manager** | npm / `package.json` | NuGet / `.csproj` |
| **Compiler config** | `tsconfig.json` | `.csproj` properties |
| **Type augmentation** | Declaration merging (`declare global`) | Extension methods |
| **Module system** | ESM `import/export` | `using` + namespaces |
| **Null handling** | `??` / `?.` (same) | `??` / `?.` (same) |

---

*This guide covers Phases 1–8. It will be updated as new phases are built.*

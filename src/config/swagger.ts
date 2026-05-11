// ── src/config/swagger.ts ── Swagger/OpenAPI Configuration ───────────
//
// Generates an OpenAPI 3.0 specification from JSDoc @openapi annotations
// scattered across the route files, then serves it via Swagger UI.
//
// HOW IT WORKS:
//   1. `swagger-jsdoc` scans route files for /** @openapi ... */ comments
//   2. It merges them into a single OpenAPI JSON specification
//   3. `swagger-ui-express` serves an interactive UI at /api/v1/docs
//
// WHY ANNOTATIONS?
//   Co-locating docs with routes keeps them in sync. When you change a
//   route, the doc comment is right there — hard to forget. A separate
//   spec file (.yaml) drifts out of sync because nobody remembers to
//   update it after changing a route.
//
// C# COMPARISON:
//   In ASP.NET, you use Swashbuckle (or NSwag) which auto-generates
//   docs from controller attributes like [HttpGet], [ProducesResponseType].
//   Here we need explicit annotations because Express routes are just
//   function calls — there's no attribute metadata like C# has.
//
//   C#:  builder.Services.AddSwaggerGen();
//        app.UseSwagger(); app.UseSwaggerUI();
//
//   Node: swagger-jsdoc (generate spec) + swagger-ui-express (serve UI)

import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

// ── OpenAPI Specification Options ────────────────────────────────────
// This config tells swagger-jsdoc:
//   - What version of OpenAPI to use (3.0.0)
//   - General API metadata (title, description, version)
//   - Where to scan for @openapi annotations (our route files)
//   - Security schemes (Bearer JWT) so "Authorize" button works in the UI

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',

    // ── API Info ───────────────────────────────────────────────────────
    // Displayed at the top of the Swagger UI page.
    info: {
      title: 'StoreKit API',
      version: '1.0.0',
      description:
        'Production-grade e-commerce REST API built with Node.js, Express, TypeScript, Prisma, and PostgreSQL.\n\n' +
        '**Features:** Auth (JWT), Products, Categories, Users, Cart, Orders, Webhooks, ' +
        'File Uploads, Redis Caching, Background Jobs (BullMQ), Rate Limiting.',
      contact: {
        name: 'StoreKit API Support',
      },
      license: {
        name: 'MIT',
      },
    },

    // ── Server URLs ───────────────────────────────────────────────────
    // Swagger UI uses these to send test requests.
    // In production, you'd add your deployed URL here.
    servers: [
      {
        url: `http://localhost:${env.port}/api/${env.apiVersion}`,
        description: 'Development server',
      },
    ],

    // ── Security Schemes ──────────────────────────────────────────────
    // Defines the "Authorize" button in Swagger UI.
    // Users click it, paste their JWT, and all protected routes
    // include the token automatically.
    //
    // C# equivalent: services.AddSwaggerGen(c => {
    //   c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme { ... });
    // });
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token (without "Bearer " prefix)',
        },
      },
    },
  },

  // ── File Scanning ─────────────────────────────────────────────────
  // swagger-jsdoc scans these files for /** @openapi ... */ comments.
  // We include all route files using a glob pattern.
  //
  // IMPORTANT: These paths are relative to the working directory (project root),
  // and we need to match both .ts source files (dev) and .js compiled files (prod).
  apis: ['./src/routes/*.ts', './src/routes/*.js'],
};

// ── Generate Spec ───────────────────────────────────────────────────
// Parses all @openapi comments and produces the full OpenAPI JSON spec.
// This runs once at startup — not on every request.
export const swaggerSpec = swaggerJsdoc(swaggerOptions);

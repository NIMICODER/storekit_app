/**
 * src/repositories/base.repository.ts — Generic Base Repository
 *
 * PURPOSE:
 *   Provides common CRUD operations that ALL repositories share.
 *   Specific repositories (ProductRepository, UserRepository, etc.) EXTEND
 *   this class and add model-specific methods.
 *
 * WHY A BASE REPOSITORY?
 * ───────────────────────────────────────────────────────────────────────────
 *   Without it, every repository would repeat findAll(), findById(), create(),
 *   update(), delete(), count() — that's hundreds of duplicated lines.
 *
 *   With it, each specific repository only adds its UNIQUE methods:
 *     - ProductRepository adds findBySlug(), findActiveProducts()
 *     - UserRepository adds findByEmail(), findAllPaginated()
 *
 * C# EQUIVALENT:
 * ───────────────────────────────────────────────────────────────────────────
 *   This is the same pattern as a generic repository in .NET:
 *
 *     public interface IRepository<T> where T : class {
 *       Task<IEnumerable<T>> GetAllAsync();
 *       Task<T?> GetByIdAsync(Guid id);
 *       Task<T> CreateAsync(T entity);
 *       Task<T> UpdateAsync(T entity);
 *       Task DeleteAsync(Guid id);
 *       Task<int> CountAsync();
 *     }
 *
 *     public class GenericRepository<T> : IRepository<T> where T : class {
 *       protected readonly DbContext _context;
 *       protected readonly DbSet<T> _dbSet;
 *       // ... implementations
 *     }
 *
 *   In Node.js/Prisma, we don't have DbSet<T> or generics on classes the
 *   same way. Instead, Prisma uses "model delegates" — each model on the
 *   prisma client (prisma.product, prisma.user, etc.) is a delegate with
 *   the same methods (findMany, findUnique, create, update, delete, count).
 *
 *   We take the delegate in the constructor and call its methods.
 *
 * TYPING NOTE:
 * ───────────────────────────────────────────────────────────────────────────
 *   The model delegate is typed as `any` — this is INTENTIONAL and CONTAINED.
 *   Prisma's internal delegate types are complex and not designed for generic
 *   use. The `any` is limited to ONE private field, and each child repository
 *   properly types its specific methods with full Prisma type safety.
 *
 *   Think of it like: the base class is the "untyped plumbing" and the child
 *   class adds the "typed public API". This is a common trade-off in
 *   TypeScript — perfect is the enemy of good.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Base Repository Class
// ─────────────────────────────────────────────────────────────────────────────

export class BaseRepository {
  /**
   * The Prisma model delegate (e.g., prisma.product, prisma.user).
   *
   * `protected` means child classes CAN access it (for custom queries),
   * but external code CANNOT. Same as `protected` in C#.
   *
   * `any` is used because Prisma's delegate types are deeply generic and
   * not designed for this pattern. The trade-off is acceptable because:
   *   1. It's contained to this ONE field
   *   2. Child repositories add full type safety in their own methods
   *   3. The Prisma delegate's method signatures are consistent across models
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected model: any;

  /**
   * Constructor — receives a Prisma model delegate.
   *
   * Usage in child class:
   *   constructor() {
   *     super(prisma.product);  // passes the Product delegate
   *   }
   *
   * C# equivalent:
   *   public GenericRepository(DbContext context) {
   *     _context = context;
   *     _dbSet = context.Set<T>();
   *   }
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(model: any) {
    this.model = model;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // READ Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Find all records, with optional Prisma query args.
   *
   * @param args - Optional Prisma findMany args (where, include, orderBy, etc.)
   * @returns Array of records
   *
   * Usage:
   *   await repo.findAll();                                    // all records
   *   await repo.findAll({ where: { isActive: true } });      // filtered
   *   await repo.findAll({ include: { category: true } });    // with relations
   *
   * C# equivalent:
   *   _dbSet.ToListAsync()
   *   _dbSet.Where(p => p.IsActive).ToListAsync()
   *   _dbSet.Include(p => p.Category).ToListAsync()
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findAll(args?: any) {
    return this.model.findMany(args);
  }

  /**
   * Find a single record by its primary key (ID).
   *
   * @param id   - The UUID primary key
   * @param args - Optional additional Prisma args (include, select, etc.)
   * @returns The record, or null if not found
   *
   * Prisma's findUnique requires a unique field in `where`.
   * Since all our models use `id` as the PK, we always search by `id`.
   *
   * C# equivalent:
   *   _dbSet.FindAsync(id)
   *   // or
   *   _dbSet.FirstOrDefaultAsync(e => e.Id == id)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findById(id: string, args?: any) {
    return this.model.findUnique({
      where: { id },
      ...args, // spread additional args (include, select, etc.)
    });
  }

  /**
   * Find a single record matching arbitrary criteria.
   *
   * @param args - Prisma findFirst args (where, include, orderBy, etc.)
   * @returns The first matching record, or null
   *
   * Unlike findById (which uses findUnique and requires a unique field),
   * this uses findFirst — it can match on ANY fields.
   *
   * Usage:
   *   await repo.findOne({ where: { email: 'admin@test.com' } });
   *   await repo.findOne({ where: { slug: 'wireless-headphones' } });
   *
   * C# equivalent:
   *   _dbSet.FirstOrDefaultAsync(e => e.Email == email)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findOne(args: any) {
    return this.model.findFirst(args);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WRITE Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new record.
   *
   * @param data - The fields to set on the new record
   * @returns The created record (with auto-generated fields like id, createdAt)
   *
   * Usage:
   *   await repo.create({ name: 'Widget', price: 9.99 });
   *
   * C# equivalent:
   *   _dbSet.Add(entity);
   *   await _context.SaveChangesAsync();
   *   return entity;  // now has Id populated by the DB
   *
   * KEY DIFFERENCE from C#:
   *   In EF Core, you call Add() then SaveChanges() — two steps.
   *   In Prisma, create() does both in one call — there's no "unit of work"
   *   pattern by default. Each Prisma call is its own transaction.
   *   (You can use prisma.$transaction() for multi-step operations.)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async create(data: any) {
    return this.model.create({ data });
  }

  /**
   * Update an existing record by ID.
   *
   * @param id   - The UUID of the record to update
   * @param data - The fields to update (partial update — only changed fields)
   * @returns The updated record
   *
   * Prisma's update() is a PARTIAL update by default — you only send the
   * fields you want to change. Unmentioned fields keep their current values.
   *
   * This is like PATCH semantics, not PUT (which would replace everything).
   *
   * C# equivalent:
   *   var entity = await _dbSet.FindAsync(id);
   *   entity.Name = newName;
   *   await _context.SaveChangesAsync();
   *   return entity;
   *
   * NOTE: If the record doesn't exist, Prisma throws a
   * PrismaClientKnownRequestError with code 'P2025'.
   * Phase 5 will handle this with custom error classes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async update(id: string, data: any) {
    return this.model.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a record by ID.
   *
   * @param id - The UUID of the record to delete
   * @returns The deleted record (Prisma returns the record that was removed)
   *
   * NOTE: This is a HARD delete — the record is permanently removed.
   * For soft-delete, you'd update a `deletedAt` timestamp instead.
   *
   * C# equivalent:
   *   var entity = await _dbSet.FindAsync(id);
   *   _dbSet.Remove(entity);
   *   await _context.SaveChangesAsync();
   */
  async delete(id: string) {
    return this.model.delete({
      where: { id },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITY Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Count records matching optional criteria.
   *
   * @param args - Optional Prisma count args (where clause)
   * @returns The number of matching records
   *
   * Usage:
   *   await repo.count();                                     // total records
   *   await repo.count({ where: { isActive: true } });       // active only
   *
   * C# equivalent:
   *   _dbSet.CountAsync()
   *   _dbSet.CountAsync(p => p.IsActive)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async count(args?: any) {
    return this.model.count(args);
  }
}

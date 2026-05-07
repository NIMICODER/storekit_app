// ── Base Repository ─────────────────────────────────────────────────────────
// Generic CRUD operations shared by all repositories.
// Child repositories extend this and add model-specific methods.

export class BaseRepository {
  // Prisma model delegate (typed as `any` — Prisma delegates aren't designed for generic use)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected model: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(model: any) {
    this.model = model;
  }

  // ── Read Operations ─────────────────────────────────────────────────────

  /** @param args - Optional Prisma findMany args (where, include, orderBy, etc.) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findAll(args?: any) {
    return this.model.findMany(args);
  }

  /** @param id - UUID primary key */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findById(id: string, args?: any) {
    return this.model.findUnique({
      where: { id },
      ...args,
    });
  }

  /** Find first record matching arbitrary criteria. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findOne(args: any) {
    return this.model.findFirst(args);
  }

  // ── Write Operations ────────────────────────────────────────────────────

  /** @returns Created record with auto-generated fields (id, createdAt, etc.) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async create(data: any) {
    return this.model.create({ data });
  }

  /** Partial update — only supplied fields are changed. Throws P2025 if not found. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async update(id: string, data: any) {
    return this.model.update({
      where: { id },
      data,
    });
  }

  /** Hard delete — permanently removes the record. */
  async delete(id: string) {
    return this.model.delete({
      where: { id },
    });
  }

  // ── Utility Operations ──────────────────────────────────────────────────

  /** @param args - Optional Prisma count args (where clause) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async count(args?: any) {
    return this.model.count(args);
  }
}

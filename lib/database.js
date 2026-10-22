import { Pool } from "pg";

const poolKey = Symbol.for("kasi-eats.postgres-pool");
let orderTablesReady;

function getDatabasePool() {
  if (globalThis[poolKey]) return globalThis[poolKey];

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error("DATABASE_URL is not configured for PostgreSQL.");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
  });
  globalThis[poolKey] = pool;
  return pool;
}

export async function ensureOrderTables() {
  if (!orderTablesReady) {
    orderTablesReady = getDatabasePool().query(`
      CREATE TABLE IF NOT EXISTS orders (
        reference TEXT PRIMARY KEY,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
        fulfilment TEXT NOT NULL CHECK (fulfilment IN ('pickup', 'delivery')),
        customer JSONB NOT NULL,
        items JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).catch((error) => {
      orderTablesReady = null;
      throw error;
    });
  }
  await orderTablesReady;
}

export async function createPendingOrder(order) {
  const result = await getDatabasePool().query(
    `
      INSERT INTO orders (reference, amount_cents, status, fulfilment, customer, items, created_at, updated_at)
      VALUES ($1, $2, 'pending', $3, $4, $5, NOW(), NOW())
      ON CONFLICT (reference) DO NOTHING
      RETURNING reference, amount_cents, status, fulfilment, customer, items;
    `,
    [order.reference, order.totalCents, order.mode, JSON.stringify(order.customer), JSON.stringify(order.items)],
  );
  if (!result.rows[0]) throw new Error("Could not create the pending payment order.");
  return result.rows[0];
}

export async function findOrder(reference) {
  const result = await getDatabasePool().query(
    `SELECT reference, amount_cents, status FROM orders WHERE reference = $1;`,
    [reference],
  );
  return result.rows[0] || null;
}

export async function setVerifiedPaymentStatus(reference, amountCents, status) {
  const pool = getDatabasePool();
  const updated = await pool.query(
    `
      UPDATE orders
      SET status = $3,
          updated_at = NOW()
      WHERE reference = $1
        AND amount_cents = $2
        AND (
          (status = 'pending' AND $3 IN ('paid', 'failed', 'cancelled'))
          OR (status IN ('failed', 'cancelled') AND $3 = 'paid')
        )
      RETURNING reference, status;
    `,
    [reference, amountCents, status],
  );
  if (updated.rows[0]) return updated.rows[0];

  const existing = await pool.query(
    `SELECT reference, status FROM orders WHERE reference = $1 AND amount_cents = $2;`,
    [reference, amountCents],
  );
  return existing.rows[0] || null;
}

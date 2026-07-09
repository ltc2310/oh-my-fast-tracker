import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { Client } from "pg";

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL. Copy it from Supabase: Project settings > Database > " +
        "Connection string (choose 'URI', Session pooler recommended) and set it in .env."
    );
  }

  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const sql = readFileSync(schemaPath, "utf-8");

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Applying sql/schema.sql ...");

  try {
    await client.query(sql);
    console.log("Schema applied successfully.");
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
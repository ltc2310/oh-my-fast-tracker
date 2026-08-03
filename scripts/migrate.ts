import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
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

  const sqlDir = path.join(__dirname, "..", "sql");

  // Get all .sql files sorted by name (numeric prefix ensures correct order)
  const sqlFiles = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("seed"))
    .sort();

  if (sqlFiles.length === 0) {
    console.log("No SQL files found in sql/ directory.");
    return;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    for (const file of sqlFiles) {
      const filePath = path.join(sqlDir, file);
      const sql = readFileSync(filePath, "utf-8");
      console.log(`Applying ${file} ...`);
      await client.query(sql);
      console.log(`  ✓ ${file} applied.`);
    }
    console.log("\nAll migrations applied successfully.");
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});

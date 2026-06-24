import { config } from "dotenv";
import path from "path";

// Load .env so DATABASE_URL etc. are available in tests
config({ path: path.resolve(__dirname, "../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before running tests");
}

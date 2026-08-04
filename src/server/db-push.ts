import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applySchema, openDevelopmentDatabase } from "./database";

const schema = readFileSync(resolve("db/schema.sql"), "utf8");
const database = openDevelopmentDatabase();

applySchema(database, schema);
database.close();

console.log("Development database is ready.");

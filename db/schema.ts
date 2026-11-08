import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One shared fictional household for this deliberately simplified hackathon demo.
export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull(),
  payload: text("payload").notNull(),
});

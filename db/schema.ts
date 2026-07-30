import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const productPairs = sqliteTable("product_pairs", {
  id: text("id").primaryKey(),
  category: text("category", { enum: ["Asphalt", "Beton"] }).notNull(),
  requestedName: text("requested_name").notNull(),
  requestedVariant: text("requested_variant").notNull(),
  alternativeName: text("alternative_name").notNull(),
  alternativeVariant: text("alternative_variant").notNull(),
  unit: text("unit", { enum: ["t", "m³"] }).notNull(),
  requestedPrice: real("requested_price").notNull(),
  alternativePrice: real("alternative_price").notNull(),
  requestedGwp: real("requested_gwp").notNull(),
  alternativeGwp: real("alternative_gwp").notNull(),
  density: real("density").notNull(),
  sourceNote: text("source_note").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  category: text("category", { enum: ["Asphalt", "Beton"] }).notNull(),
  name: text("name").notNull(),
  variant: text("variant").notNull(),
  unit: text("unit", { enum: ["t", "m³"] }).notNull(),
  price: real("price").notNull(),
  gwp: real("gwp"),
  density: real("density").notNull(),
  sourceNote: text("source_note").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  source: text("source").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type ProductPairRow = typeof productPairs.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;

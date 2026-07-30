import { asc, sql } from "drizzle-orm";
import { getD1Binding, getDb } from "../../../db";
import { appSettings, products } from "../../../db/schema";
import {
  CATALOG_DATA_VERSION,
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
  type AppSetting,
  type Product,
} from "../../../lib/default-data";
import { getAdminUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

async function ensureSeeded() {
  const db = getDb();
  const d1 = getD1Binding();
  const [productCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products);
  const storedSettings = await db.select().from(appSettings);
  const storedVersion = storedSettings.find(
    (setting) => setting.key === "_catalogDataVersion",
  )?.value;
  const productCountValue = Number(productCount?.count ?? 0);
  const shouldSeedProducts = productCountValue === 0;
  const shouldUpgradeProducts =
    productCountValue > 0 &&
    Number(storedVersion ?? 0) !== CATALOG_DATA_VERSION;

  if (shouldSeedProducts) {
    for (let index = 0; index < DEFAULT_PRODUCTS.length; index += 5) {
      await db
        .insert(products)
        .values(DEFAULT_PRODUCTS.slice(index, index + 5));
    }
  } else if (shouldUpgradeProducts) {
    const updateProductGwp = `
      UPDATE products
      SET gwp = ?, source_note = ?, updated_at = ?
      WHERE id = ?
    `;
    for (let index = 0; index < DEFAULT_PRODUCTS.length; index += 25) {
      const statements = DEFAULT_PRODUCTS.slice(index, index + 25).map(
        (product) =>
          d1.prepare(updateProductGwp).bind(
            product.gwp,
            product.sourceNote,
            product.updatedAt,
            product.id,
          ),
      );
      await d1.batch(statements);
    }
  }

  if (storedSettings.length === 0) {
    await db.insert(appSettings).values(DEFAULT_SETTINGS);
  } else if (Number(storedVersion ?? 0) !== CATALOG_DATA_VERSION) {
    const versionSetting = DEFAULT_SETTINGS.find(
      (setting) => setting.key === "_catalogDataVersion",
    );
    if (versionSetting) {
      await db
        .insert(appSettings)
        .values(versionSetting)
        .onConflictDoUpdate({
          target: appSettings.key,
          set: versionSetting,
        });
    }
  }
}

function cleanProduct(value: unknown, index: number): Product {
  if (!value || typeof value !== "object") {
    throw new Error(`Ungültige Produktzeile ${index + 1}.`);
  }
  const row = value as Record<string, unknown>;
  const text = (key: string) => String(row[key] ?? "").trim();
  const number = (key: string) => {
    const parsed = Number(row[key]);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `Ungültiger Zahlenwert "${key}" in Zeile ${index + 1}.`,
      );
    }
    return parsed;
  };
  const category = text("category");
  const unit = text("unit");
  if (category !== "Asphalt" && category !== "Beton") {
    throw new Error(
      `Kategorie in Zeile ${index + 1} muss Asphalt oder Beton sein.`,
    );
  }
  if (unit !== "t" && unit !== "m³") {
    throw new Error(`Einheit in Zeile ${index + 1} muss t oder m³ sein.`);
  }

  const id = text("id");
  const name = text("name");
  if (!id || !name) {
    throw new Error(`ID und Produktname fehlen in Zeile ${index + 1}.`);
  }
  const rawGwp = row.gwp;
  const gwp =
    rawGwp === null || rawGwp === undefined || rawGwp === ""
      ? null
      : Number(rawGwp);
  if (gwp !== null && !Number.isFinite(gwp)) {
    throw new Error(`Ungültiger CO₂-Wert in Zeile ${index + 1}.`);
  }

  return {
    id,
    category,
    name,
    variant: text("variant"),
    unit,
    price: number("price"),
    gwp,
    density: number("density"),
    sourceNote: text("sourceNote"),
    active: row.active === false || row.active === 0 ? false : true,
    sortOrder: Math.trunc(number("sortOrder")),
    updatedAt: new Date().toISOString(),
  };
}

function cleanSetting(value: unknown, index: number): AppSetting {
  if (!value || typeof value !== "object") {
    throw new Error(`Ungültige Einstellungszeile ${index + 1}.`);
  }
  const row = value as Record<string, unknown>;
  const numericValue = Number(row.value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Ungültiger Einstellungswert in Zeile ${index + 1}.`);
  }
  const key = String(row.key ?? "").trim();
  if (!key) {
    throw new Error(`Fehlender Einstellungsschlüssel in Zeile ${index + 1}.`);
  }
  return {
    key,
    label: String(row.label ?? "").trim(),
    value: numericValue,
    unit: String(row.unit ?? "").trim(),
    source: String(row.source ?? "").trim(),
    updatedAt: new Date().toISOString(),
  };
}

function errorMessage(error: unknown) {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && !messages.includes(current.message)) {
    messages.push(current.message);
    current = current.cause;
  }
  const message = messages.join(" ");
  if (message.includes("no such table")) {
    return "Die Stammdatenbank ist noch nicht initialisiert. Bitte die aktuelle Version erneut bereitstellen.";
  }
  if (message.includes("Failed query")) {
    return "Die Stammdaten konnten nicht geladen werden. Es werden vorübergehend die versionierten Basisdaten verwendet.";
  }
  return message || "Unbekannter Fehler";
}

export async function GET() {
  try {
    await ensureSeeded();
    const db = getDb();
    const [catalogProducts, settings] = await Promise.all([
      db.select().from(products).orderBy(asc(products.sortOrder)),
      db.select().from(appSettings).orderBy(asc(appSettings.key)),
    ]);
    return Response.json({ products: catalogProducts, settings });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!(await getAdminUser())) {
      return Response.json(
        { error: "Für Änderungen ist eine Admin-Anmeldung erforderlich." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      products?: unknown[];
      settings?: unknown[];
    };
    if (!Array.isArray(body.products) || !Array.isArray(body.settings)) {
      return Response.json(
        {
          error:
            "Produkte und Einstellungen müssen vollständig übergeben werden.",
        },
        { status: 400 },
      );
    }

    const catalogProducts = body.products.map(cleanProduct);
    const settings = body.settings.map(cleanSetting);
    const ids = new Set(catalogProducts.map((product) => product.id));
    if (ids.size !== catalogProducts.length) {
      return Response.json(
        { error: "Produkt-IDs müssen eindeutig sein." },
        { status: 400 },
      );
    }
    const d1 = getD1Binding();

    const productInsert = `
      INSERT INTO products (
        id, category, name, variant, unit, price, gwp, density,
        source_note, active, sort_order, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const settingInsert = `
      INSERT INTO app_settings (
        key, label, value, unit, source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const statements = [
      d1.prepare("DELETE FROM products"),
      d1.prepare("DELETE FROM app_settings"),
      ...catalogProducts.map((product) =>
        d1.prepare(productInsert).bind(
          product.id,
          product.category,
          product.name,
          product.variant,
          product.unit,
          product.price,
          product.gwp,
          product.density,
          product.sourceNote,
          product.active ? 1 : 0,
          product.sortOrder,
          product.updatedAt,
        ),
      ),
      ...settings.map((setting) =>
        d1.prepare(settingInsert).bind(
          setting.key,
          setting.label,
          setting.value,
          setting.unit,
          setting.source,
          setting.updatedAt,
        ),
      ),
    ];

    await d1.batch(statements);
    return Response.json({
      products: catalogProducts,
      settings,
      saved: true,
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

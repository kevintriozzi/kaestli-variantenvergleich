import catalog from "./product-catalog.json";

export type Product = {
  id: string;
  category: "Asphalt" | "Beton";
  name: string;
  variant: string;
  unit: "t" | "m³";
  price: number;
  gwp: number | null;
  density: number;
  sourceNote: string;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type AppSetting = {
  key: string;
  label: string;
  value: number;
  unit: string;
  source: string;
  updatedAt: string;
};

const UPDATED_AT = "2026-07-30T00:00:00.000Z";
export const CATALOG_DATA_VERSION = 2;

const CONCRETE_MANUFACTURING_GWP = [
  154, 155, 176, 153, 155, 157, 140, 141, 143, 140, 141, 143, 174, 174, 152,
  172, 172, 174, 173, 176, 174, 154, 155, 173, 153, 153, 153, 175, 174, 176,
  174,
];

const ASPHALT_TEMPERATURE_REDUCTION: Record<string, number> = {
  "AC 11 H": 2.7,
  "AC 11 L": 2.71,
  "AC 11 N": 2.73,
  "AC 11 S": 2.7,
  "AC 16 L": 2.72,
  "AC 16 N": 2.72,
  "AC 4 L": 2.71,
  "AC 8 H": 2.7,
  "AC 8 L": 2.7,
  "AC 8 N": 2.7,
  "AC 8 S": 2.55,
  "AC B 11 S": 2.23,
  "AC B 16 H": 2.25,
  "AC B 16 S": 2.23,
  "AC B 22 H": 2.24,
  "AC B 22 S": 2.25,
  "AC EME 22 C1": 2.22,
  "AC EME 22 C2": 2.23,
  "AC F 22": 2.23,
  "AC MR 11": 2.71,
  "AC MR 8": 2.71,
  "AC T 11 L": 2.21,
  "AC T 11 N": 2.22,
  "AC T 16 L": 2.22,
  "AC T 16 N": 2.21,
  "AC T 16 S": 2.23,
  "AC T 22 H": 2.24,
  "AC T 22 L": 2.2,
  "AC T 22 N": 2.23,
  "AC T 22 S": 2.23,
  "AC T 32 H": 2.23,
  "AC T 32 S": 2.24,
  "PA 11": 2.72,
  "PA 8": 2.72,
  "PA B 16": 2.21,
  "PA B 22": 2.24,
  "PA S 16": 2.23,
  "PA S 22": 2.24,
};

function manufacturingGwp(
  product: (typeof catalog)[number],
  concreteIndex: number,
) {
  if (product.gwp === null) return null;
  if (product.category === "Beton") {
    return CONCRETE_MANUFACTURING_GWP[concreteIndex] ?? product.gwp;
  }
  const disposalGwp = product.sourceNote.includes("Asphaltrechner, Zeile 57")
    ? 14.758
    : 14.7;
  return Math.max(0, product.gwp - disposalGwp);
}

export function asphaltTemperatureReduction(productName: string) {
  if (ASPHALT_TEMPERATURE_REDUCTION[productName] !== undefined) {
    return ASPHALT_TEMPERATURE_REDUCTION[productName];
  }
  if (productName.startsWith("SMA")) return 2.72;
  if (productName.startsWith("SDA")) return 2.72;
  if (
    productName.startsWith("AC T") ||
    productName.startsWith("AC B") ||
    productName.startsWith("AC EME") ||
    productName.startsWith("AC F") ||
    productName.startsWith("PA B") ||
    productName.startsWith("PA S")
  ) {
    return 2.23;
  }
  return 2.7;
}

let concreteIndex = 0;
export const DEFAULT_PRODUCTS: Product[] = catalog.map((product) => {
  const currentConcreteIndex = concreteIndex;
  if (product.category === "Beton") concreteIndex += 1;
  return {
    ...product,
    category: product.category === "Beton" ? "Beton" : "Asphalt",
    unit: product.unit === "m³" ? "m³" : "t",
    gwp: manufacturingGwp(product, currentConcreteIndex),
    sourceNote: product.sourceNote
      .replace(
        "Asphaltrechner, Zeile 57 (GWP Total ohne D)",
        "Asphaltrechner, Zeile 56 (GWP Herstellung)",
      )
      .replace(
        "Betonrechner, Zeile 28 (GWP Total)",
        "Betonrechner, Zeile 27 (GWP Herstellung)",
      )
      .replace(
        "Referenz Heissasphalt mit",
        "GWP Herstellung Referenz Heissasphalt mit",
      ),
    updatedAt: UPDATED_AT,
  };
});

export const DEFAULT_SETTINGS: AppSetting[] = [
  {
    key: "_catalogDataVersion",
    label: "Stammdatenversion",
    value: CATALOG_DATA_VERSION,
    unit: "Version",
    source: "Interne Versionskennung.",
    updatedAt: UPDATED_AT,
  },
  {
    key: "truckPayload",
    label: "Nutzlast 40-t-Dieselfahrzeug",
    value: 25,
    unit: "t/Fuhre",
    source: "Projektannahme; im Admin-Bereich anpassbar.",
    updatedAt: UPDATED_AT,
  },
  {
    key: "truckEmissionFactor",
    label: "CO₂-Faktor LKW 32–40 t",
    value: 1.369,
    unit: "kg CO₂e/Fz-km",
    source:
      "KBOB/BAFU/UVEK Ökobilanzdaten 2022, total pro Fahrzeugkilometer.",
    updatedAt: UPDATED_AT,
  },
  {
    key: "roundTripFactor",
    label: "Hin- und Rückweg",
    value: 2,
    unit: "Faktor",
    source: "Vorgabe: Hin- und Rückweg werden immer berücksichtigt.",
    updatedAt: UPDATED_AT,
  },
  {
    key: "concreteDensity",
    label: "Dichte Beton",
    value: 2.35,
    unit: "t/m³",
    source:
      "Projektannahme; im Admin-Bereich anpassbar und je Produkt überschreibbar.",
    updatedAt: UPDATED_AT,
  },
];

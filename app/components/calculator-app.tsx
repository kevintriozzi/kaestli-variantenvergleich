"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  asphaltTemperatureReduction,
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
  type AppSetting,
  type Product,
} from "../../lib/default-data";
import {
  createVariantDocument,
  packVariantDocument,
} from "./word-export";

type LocationRow = {
  postcode: string;
  place: string;
  distance: number;
  search: string;
};

type View = "calculator" | "admin";
type Category = "Asphalt" | "Beton";
type Outcome = "positive" | "negative" | "neutral";
type AsphaltTemperature =
  | "Niedertemperaturasphalt"
  | "Heissasphalt";

const PRICE_SOURCE_URL =
  "https://main.kaestli.net/wp/wp-content/uploads/2026/01/Gesamtpreisliste-2026.pdf";
const ASPHALT_SOURCE_URL = "https://asphaltrechner.ch/de/herstellende";
const CONCRETE_SOURCE_URL =
  "https://calc.ecobau.ch/betonrechner/frontend";
const KBOB_SOURCE_URL =
  "https://www.ecobau.ch/resources/uploads/Oekobilanzdaten/Hintergrundberichte/KBOB_BAFU_AHB_2022_Transportsysteme_v1_0.pdf";

function formatSwiss(
  value: number,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
) {
  const safe = Number.isFinite(value) ? value : 0;
  const factor = 10 ** maximumFractionDigits;
  const rounded = Math.round((safe + Number.EPSILON) * factor) / factor;
  const sign = rounded < 0 ? "−" : "";
  const [integerPart, rawFraction = ""] = Math.abs(rounded)
    .toFixed(maximumFractionDigits)
    .split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, "’");
  const trimmedFraction = rawFraction
    .replace(/0+$/, "")
    .padEnd(minimumFractionDigits, "0");
  return `${sign}${grouped}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

const money = {
  format: (value: number) => `CHF ${formatSwiss(value, 2, 2)}`,
};

const number = {
  format: (value: number) => formatSwiss(value, 0, 1),
};

const preciseNumber = {
  format: (value: number) => formatSwiss(value, 0, 3),
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clampDiscount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function settingValue(settings: AppSetting[], key: string, fallback: number) {
  return settings.find((setting) => setting.key === key)?.value ?? fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number | boolean | null) {
  const text = value === null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) =>
    candidate.some((value) => value.trim()),
  );
}

function outcome(delta: number): Outcome {
  if (Math.abs(delta) < 0.005) return "neutral";
  return delta < 0 ? "positive" : "negative";
}

function productGwp(
  product: Product,
  temperature: AsphaltTemperature,
) {
  if (product.gwp === null || product.category !== "Asphalt") {
    return product.gwp;
  }
  if (temperature === "Heissasphalt") return product.gwp;
  return Math.max(
    0,
    product.gwp - asphaltTemperatureReduction(product.name),
  );
}

function ComparisonBars({
  title,
  unit,
  requested,
  alternative,
  format,
}: {
  title: string;
  unit: string;
  requested: number;
  alternative: number;
  format: (value: number) => string;
}) {
  const max = Math.max(requested, alternative, 1);
  const result = outcome(alternative - requested);
  return (
    <article className="chart-card">
      <div className="chart-heading">
        <div>
          <p className="eyebrow">{unit}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="bar-row">
        <div className="bar-label">
          <span>Bauherrenvariante</span>
          <strong>{format(requested)}</strong>
        </div>
        <div className="bar-track">
          <span
            className="bar-fill bar-requested"
            style={{ width: `${Math.max(2, (requested / max) * 100)}%` }}
          />
        </div>
      </div>
      <div className="bar-row">
        <div className="bar-label">
          <span>Kästli-Alternative</span>
          <strong>{format(alternative)}</strong>
        </div>
        <div className="bar-track">
          <span
            className={`bar-fill bar-alternative ${result}`}
            style={{ width: `${Math.max(2, (alternative / max) * 100)}%` }}
          />
        </div>
      </div>
    </article>
  );
}

function firstProduct(category: Category) {
  return DEFAULT_PRODUCTS.find(
    (product) => product.category === category && product.active,
  );
}

function secondProduct(category: Category) {
  return DEFAULT_PRODUCTS.filter(
    (product) => product.category === category && product.active,
  )[1];
}

export default function CalculatorApp({
  adminSignInPath,
  initialView = "calculator",
  isAdmin,
}: {
  adminSignInPath: string;
  initialView?: View;
  isAdmin: boolean;
}) {
  const [view, setView] = useState<View>(initialView);
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [settings, setSettings] = useState<AppSetting[]>(DEFAULT_SETTINGS);
  const [adminProducts, setAdminProducts] =
    useState<Product[]>(DEFAULT_PRODUCTS);
  const [adminSettings, setAdminSettings] =
    useState<AppSetting[]>(DEFAULT_SETTINGS);
  const [catalogNotice, setCatalogNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [category, setCategory] = useState<Category>("Asphalt");
  const [requestedId, setRequestedId] = useState(
    firstProduct("Asphalt")?.id ?? "",
  );
  const [alternativeId, setAlternativeId] = useState(
    secondProduct("Asphalt")?.id ?? firstProduct("Asphalt")?.id ?? "",
  );
  const [requestedQuantity, setRequestedQuantity] = useState(120);
  const [alternativeQuantity, setAlternativeQuantity] = useState(120);
  const [requestedTemperature, setRequestedTemperature] =
    useState<AsphaltTemperature>("Heissasphalt");
  const [alternativeTemperature, setAlternativeTemperature] =
    useState<AsphaltTemperature>("Niedertemperaturasphalt");
  const [requestedDiscount, setRequestedDiscount] = useState(0);
  const [alternativeDiscount, setAlternativeDiscount] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationQuery, setLocationQuery] = useState("3110 Münsingen");
  const [selectedLocation, setSelectedLocation] =
    useState<LocationRow | null>(null);
  const [distance, setDistance] = useState(3.9);
  const [locationOpen, setLocationOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const locationBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/catalog", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Stammdatenfehler");
        return payload as {
          products: Product[];
          settings: AppSetting[];
        };
      }),
      fetch("/data/postcodes.json").then(
        (response) => response.json() as Promise<LocationRow[]>,
      ),
    ])
      .then(([catalog, locationRows]) => {
        if (!alive) return;
        setProducts(catalog.products);
        setSettings(catalog.settings);
        setAdminProducts(catalog.products);
        setAdminSettings(catalog.settings);
        setLocations(locationRows);
        const asphalt = catalog.products.filter(
          (product) => product.active && product.category === "Asphalt",
        );
        if (asphalt[0]) setRequestedId(asphalt[0].id);
        if (asphalt[1]) setAlternativeId(asphalt[1].id);
        const initial = locationRows.find(
          (row) => row.postcode === "3110" && row.place === "Münsingen",
        );
        if (initial) {
          setSelectedLocation(initial);
          setDistance(initial.distance);
          setLocationQuery(`${initial.postcode} ${initial.place}`);
        }
      })
      .catch((error) => {
        if (!alive) return;
        setCatalogNotice(
          `Versionierte Basisdaten werden verwendet. ${
            error instanceof Error ? error.message : ""
          }`,
        );
        fetch("/data/postcodes.json")
          .then((response) => response.json() as Promise<LocationRow[]>)
          .then((locationRows) => {
            if (!alive) return;
            setLocations(locationRows);
            const initial = locationRows.find(
              (row) => row.postcode === "3110" && row.place === "Münsingen",
            );
            if (initial) setSelectedLocation(initial);
          })
          .catch(() => undefined);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (
        locationBox.current &&
        !locationBox.current.contains(event.target as Node)
      ) {
        setLocationOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const categoryProducts = useMemo(
    () =>
      products
        .filter(
          (product) => product.active && product.category === category,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [category, products],
  );

  const requestedProduct =
    categoryProducts.find((product) => product.id === requestedId) ??
    categoryProducts[0] ??
    DEFAULT_PRODUCTS[0];
  const alternativeProduct =
    categoryProducts.find((product) => product.id === alternativeId) ??
    categoryProducts[1] ??
    categoryProducts[0] ??
    DEFAULT_PRODUCTS[0];

  const locationSuggestions = useMemo(() => {
    const query = normalizeSearch(locationQuery);
    if (!query) return locations.slice(0, 8);
    return locations
      .filter((row) => row.search.includes(query))
      .sort((a, b) => {
        const aStarts = a.search.startsWith(query) ? 0 : 1;
        const bStarts = b.search.startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.distance - b.distance;
      })
      .slice(0, 8);
  }, [locationQuery, locations]);

  const calculations = useMemo(() => {
    const requestedAmount = Math.max(0, Number(requestedQuantity) || 0);
    const alternativeAmount = Math.max(
      0,
      Number(alternativeQuantity) || 0,
    );
    const reqDiscount = clampDiscount(requestedDiscount);
    const altDiscount = clampDiscount(alternativeDiscount);
    const requestedNetUnit =
      requestedProduct.price * (1 - reqDiscount / 100);
    const alternativeNetUnit =
      alternativeProduct.price * (1 - altDiscount / 100);
    const requestedPriceTotal = requestedNetUnit * requestedAmount;
    const alternativePriceTotal = alternativeNetUnit * alternativeAmount;
    const requestedDensity =
      requestedProduct.unit === "m³"
        ? requestedProduct.density ||
          settingValue(settings, "concreteDensity", 2.35)
        : 1;
    const alternativeDensity =
      alternativeProduct.unit === "m³"
        ? alternativeProduct.density ||
          settingValue(settings, "concreteDensity", 2.35)
        : 1;
    const requestedWeight = requestedAmount * requestedDensity;
    const alternativeWeight = alternativeAmount * alternativeDensity;
    const payload = Math.max(
      0.1,
      settingValue(settings, "truckPayload", 25),
    );
    const requestedTrips =
      requestedWeight > 0 ? Math.ceil(requestedWeight / payload) : 0;
    const alternativeTrips =
      alternativeWeight > 0 ? Math.ceil(alternativeWeight / payload) : 0;
    const roundTripFactor = settingValue(settings, "roundTripFactor", 2);
    const truckFactor = settingValue(
      settings,
      "truckEmissionFactor",
      1.369,
    );
    const safeDistance = Math.max(0, Number(distance) || 0);
    const requestedTransportCo2 =
      requestedTrips * safeDistance * roundTripFactor * truckFactor;
    const alternativeTransportCo2 =
      alternativeTrips * safeDistance * roundTripFactor * truckFactor;
    const requestedGwp = productGwp(
      requestedProduct,
      requestedTemperature,
    );
    const alternativeGwp = productGwp(
      alternativeProduct,
      alternativeTemperature,
    );
    const requestedMaterialCo2 =
      (requestedGwp ?? 0) * requestedAmount;
    const alternativeMaterialCo2 =
      (alternativeGwp ?? 0) * alternativeAmount;
    const requestedCo2Total =
      requestedMaterialCo2 + requestedTransportCo2;
    const alternativeCo2Total =
      alternativeMaterialCo2 + alternativeTransportCo2;
    const co2Difference = alternativeCo2Total - requestedCo2Total;
    const co2DifferencePercent =
      requestedCo2Total > 0
        ? (Math.abs(co2Difference) / requestedCo2Total) * 100
        : 0;
    const priceDifference =
      alternativePriceTotal - requestedPriceTotal;

    return {
      requestedAmount,
      alternativeAmount,
      requestedGwp,
      alternativeGwp,
      requestedNetUnit,
      alternativeNetUnit,
      requestedPriceTotal,
      alternativePriceTotal,
      requestedDensity,
      alternativeDensity,
      requestedWeight,
      alternativeWeight,
      payload,
      requestedTrips,
      alternativeTrips,
      roundTripFactor,
      truckFactor,
      requestedTransportCo2,
      alternativeTransportCo2,
      requestedMaterialCo2,
      alternativeMaterialCo2,
      requestedCo2Total,
      alternativeCo2Total,
      co2Difference,
      co2DifferencePercent,
      priceDifference,
    };
  }, [
    alternativeDiscount,
    alternativeQuantity,
    alternativeProduct,
    alternativeTemperature,
    distance,
    requestedDiscount,
    requestedQuantity,
    requestedProduct,
    requestedTemperature,
    settings,
  ]);

  const dataReady =
    calculations.requestedGwp !== null &&
    calculations.alternativeGwp !== null;
  const priceResult = outcome(calculations.priceDifference);
  const co2Result = outcome(calculations.co2Difference);

  function selectCategory(next: Category) {
    setCategory(next);
    const candidates = products
      .filter((product) => product.active && product.category === next)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (candidates[0]) setRequestedId(candidates[0].id);
    if (candidates[1]) setAlternativeId(candidates[1].id);
    else if (candidates[0]) setAlternativeId(candidates[0].id);
    const initialQuantity = next === "Asphalt" ? 120 : 50;
    setRequestedQuantity(initialQuantity);
    setAlternativeQuantity(initialQuantity);
  }

  function switchView(next: View) {
    if (next === "admin" && !isAdmin) return;
    setView(next);
    window.requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  function chooseLocation(location: LocationRow) {
    setSelectedLocation(location);
    setDistance(location.distance);
    setLocationQuery(`${location.postcode} ${location.place}`);
    setLocationOpen(false);
  }

  async function exportWord() {
    setExporting(true);
    setExportNotice("");
    try {
      const logoBuffer = await fetch("/document-template-logo.jpeg").then(
        async (response) => {
          if (!response.ok) throw new Error("Dokumentvorlage fehlt.");
          return new Uint8Array(await response.arrayBuffer());
        },
      );
      const locationLabel = selectedLocation
        ? `${selectedLocation.postcode} ${selectedLocation.place}`
        : locationQuery || "Baustelle";
      const document = await createVariantDocument(
        {
          projectName: projectName.trim() || "Ohne Projektbezeichnung",
          location: locationLabel,
          distance,
          unit: requestedProduct.unit,
          requestedQuantity: calculations.requestedAmount,
          alternativeQuantity: calculations.alternativeAmount,
          requestedName: requestedProduct.name,
          requestedVariant: requestedProduct.variant,
          requestedTemperature:
            category === "Asphalt" ? requestedTemperature : null,
          requestedPrice: requestedProduct.price,
          requestedDiscount: clampDiscount(requestedDiscount),
          requestedNetUnit: calculations.requestedNetUnit,
          requestedPriceTotal: calculations.requestedPriceTotal,
          requestedMaterialCo2: calculations.requestedMaterialCo2,
          requestedCo2Total: calculations.requestedCo2Total,
          alternativeName: alternativeProduct.name,
          alternativeVariant: alternativeProduct.variant,
          alternativeTemperature:
            category === "Asphalt" ? alternativeTemperature : null,
          alternativePrice: alternativeProduct.price,
          alternativeDiscount: clampDiscount(alternativeDiscount),
          alternativeNetUnit: calculations.alternativeNetUnit,
          alternativePriceTotal: calculations.alternativePriceTotal,
          alternativeMaterialCo2: calculations.alternativeMaterialCo2,
          alternativeCo2Total: calculations.alternativeCo2Total,
          requestedTransportCo2: calculations.requestedTransportCo2,
          requestedTrips: calculations.requestedTrips,
          requestedWeight: calculations.requestedWeight,
          alternativeTransportCo2:
            calculations.alternativeTransportCo2,
          alternativeTrips: calculations.alternativeTrips,
          alternativeWeight: calculations.alternativeWeight,
          payload: calculations.payload,
          roundTripDistance:
            distance * calculations.roundTripFactor,
          truckFactor: calculations.truckFactor,
        },
        logoBuffer,
      );
      const blob = await packVariantDocument(document);
      const safeProduct = requestedProduct.name
        .replace(/[^a-zA-Z0-9äöüÄÖÜ-]+/g, "-")
        .replace(/-+/g, "-");
      downloadBlob(
        blob,
        `Kaestli-Variantenvergleich-${safeProduct}.docx`,
      );
      setExportNotice(
        "Bearbeitbare Word-Beilage wurde auf Basis der Vorlage erstellt.",
      );
    } catch (error) {
      setExportNotice(
        `Word-Export fehlgeschlagen: ${
          error instanceof Error ? error.message : "Unbekannter Fehler"
        }`,
      );
    } finally {
      setExporting(false);
    }
  }

  function updateAdminProduct(
    id: string,
    key: keyof Product,
    value: string | number | boolean | null,
  ) {
    setAdminProducts((current) =>
      current.map((product) =>
        product.id === id
          ? {
              ...product,
              [key]: value,
              updatedAt: new Date().toISOString(),
            }
          : product,
      ),
    );
  }

  function updateAdminSetting(key: string, value: number) {
    setAdminSettings((current) =>
      current.map((setting) =>
        setting.key === key
          ? {
              ...setting,
              value,
              updatedAt: new Date().toISOString(),
            }
          : setting,
      ),
    );
  }

  function addProduct() {
    const timestamp = Date.now();
    setAdminProducts((current) => [
      ...current,
      {
        id: `produkt-${timestamp}`,
        category: "Asphalt",
        name: "Neues Produkt",
        variant: "",
        unit: "t",
        price: 0,
        gwp: null,
        density: 1,
        sourceNote: "Manuell ergänzt.",
        active: true,
        sortOrder: current.length
          ? Math.max(...current.map((product) => product.sortOrder)) + 10
          : 10,
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  function exportCsv() {
    const keys: (keyof Product)[] = [
      "id",
      "category",
      "name",
      "variant",
      "unit",
      "price",
      "gwp",
      "density",
      "sourceNote",
      "active",
      "sortOrder",
    ];
    const lines = [
      keys.join(","),
      ...adminProducts.map((product) =>
        keys.map((key) => escapeCsv(product[key])).join(","),
      ),
    ];
    downloadBlob(
      new Blob([`\uFEFF${lines.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
      "kaestli-stammdaten-produkte.csv",
    );
  }

  async function importCsv(file: File) {
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) {
        throw new Error("Die CSV-Datei enthält keine Daten.");
      }
      const headers = rows[0];
      const required = [
        "id",
        "category",
        "name",
        "unit",
        "price",
        "gwp",
      ];
      const missing = required.filter((key) => !headers.includes(key));
      if (missing.length) {
        throw new Error(`Fehlende Spalten: ${missing.join(", ")}`);
      }
      const imported = rows.slice(1).map((values, index) => {
        const source = Object.fromEntries(
          headers.map((header, column) => [
            header,
            values[column] ?? "",
          ]),
        );
        const numeric = (key: string) => {
          const parsed = Number(source[key]);
          if (!Number.isFinite(parsed)) {
            throw new Error(
              `Ungültiger Wert "${key}" in Zeile ${index + 2}.`,
            );
          }
          return parsed;
        };
        return {
          id: source.id,
          category: source.category === "Beton" ? "Beton" : "Asphalt",
          name: source.name,
          variant: source.variant ?? "",
          unit: source.unit === "m³" ? "m³" : "t",
          price: numeric("price"),
          gwp: source.gwp === "" ? null : numeric("gwp"),
          density: source.density ? numeric("density") : 1,
          sourceNote: source.sourceNote ?? "CSV-Import",
          active: !["false", "0", "nein"].includes(
            String(source.active).toLowerCase(),
          ),
          sortOrder: source.sortOrder
            ? numeric("sortOrder")
            : (index + 1) * 10,
          updatedAt: new Date().toISOString(),
        } satisfies Product;
      });
      setAdminProducts(imported);
      setCatalogNotice(
        `${imported.length} Produkte aus CSV übernommen. Zum Abschluss speichern.`,
      );
    } catch (error) {
      setCatalogNotice(
        `CSV-Import fehlgeschlagen: ${
          error instanceof Error ? error.message : "Unbekannter Fehler"
        }`,
      );
    }
  }

  async function saveCatalog() {
    setIsSaving(true);
    setCatalogNotice("");
    try {
      const response = await fetch("/api/admin/catalog", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products: adminProducts,
          settings: adminSettings,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Speichern fehlgeschlagen.");
      }
      setProducts(payload.products);
      setSettings(payload.settings);
      setAdminProducts(payload.products);
      setAdminSettings(payload.settings);
      setCatalogNotice("Stammdaten wurden gespeichert.");
    } catch (error) {
      setCatalogNotice(
        `Speichern fehlgeschlagen: ${
          error instanceof Error ? error.message : "Unbekannter Fehler"
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  const asphaltCount = adminProducts.filter(
    (product) => product.category === "Asphalt",
  ).length;
  const concreteCount = adminProducts.filter(
    (product) => product.category === "Beton",
  ).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand-button"
          onClick={() => switchView("calculator")}
          aria-label="Zum Variantenvergleich"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kaestli-logo.png"
            alt="Kästli"
            width={177}
            height={56}
          />
        </button>
        <nav className="topnav" aria-label="Hauptnavigation">
          <button
            className={
              view === "calculator" ? "nav-button active" : "nav-button"
            }
            onClick={() => switchView("calculator")}
          >
            Variantenvergleich
          </button>
          {isAdmin ? (
            <button
              className={
                view === "admin" ? "nav-button active" : "nav-button"
              }
              onClick={() => switchView("admin")}
            >
              Stammdaten
            </button>
          ) : (
            <a className="nav-button" href={adminSignInPath}>
              Admin
            </a>
          )}
        </nav>
      </header>

      {view === "calculator" ? (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">ÖKOLOGISCHER VARIANTENVERGLEICH</p>
              <h1>Zwei Varianten. Klar belegt.</h1>
              <p>
                Bauherrenprodukt und Kästli-Alternative frei wählen, Mengen und
                Baustelle erfassen und Preis sowie CO₂-Wirkung direkt
                vergleichen.
              </p>
            </div>
          </section>

          {catalogNotice ? (
            <div className="notice" role="status">
              {catalogNotice}
            </div>
          ) : null}

          <section className="input-grid" aria-label="Eingaben">
            <article className="input-card product-card">
              <div className="section-number">01</div>
              <div className="section-copy">
                <p className="eyebrow">PRODUKTVARIANTEN</p>
                <h2>Was wird verglichen?</h2>
              </div>
              <div className="segmented" aria-label="Produktkategorie">
                <button
                  className={category === "Asphalt" ? "selected" : ""}
                  onClick={() => selectCategory("Asphalt")}
                >
                  Asphalt · 65
                </button>
                <button
                  className={category === "Beton" ? "selected" : ""}
                  onClick={() => selectCategory("Beton")}
                >
                  Beton · 31
                </button>
              </div>
              <div className="variant-selector-grid">
                <label className="field">
                  <span>Bauherrenvariante</span>
                  <select
                    value={requestedProduct.id}
                    onChange={(event) => setRequestedId(event.target.value)}
                  >
                    {categoryProducts.map((product) => (
                      <option value={product.id} key={product.id}>
                        {product.name} · {product.variant}
                      </option>
                    ))}
                  </select>
                  {requestedProduct.gwp === null ? (
                    <small className="field-warning">
                      CO₂-Wert ist im Adminbereich zu ergänzen.
                    </small>
                  ) : null}
                </label>
                <label className="field alternative-field">
                  <span>Kästli-Alternative</span>
                  <select
                    value={alternativeProduct.id}
                    onChange={(event) =>
                      setAlternativeId(event.target.value)
                    }
                  >
                    {categoryProducts.map((product) => (
                      <option value={product.id} key={product.id}>
                        {product.name} · {product.variant}
                      </option>
                    ))}
                  </select>
                  {alternativeProduct.gwp === null ? (
                    <small className="field-warning">
                      CO₂-Wert ist im Adminbereich zu ergänzen.
                    </small>
                  ) : null}
                </label>
              </div>
              {category === "Asphalt" ? (
                <div className="dual-field-grid temperature-fields">
                  <label className="field">
                    <span>Herstellung Bauherrenvariante</span>
                    <select
                      value={requestedTemperature}
                      onChange={(event) =>
                        setRequestedTemperature(
                          event.target.value as AsphaltTemperature,
                        )
                      }
                    >
                      <option>Niedertemperaturasphalt</option>
                      <option>Heissasphalt</option>
                    </select>
                  </label>
                  <label className="field alternative-field">
                    <span>Herstellung Kästli-Alternative</span>
                    <select
                      value={alternativeTemperature}
                      onChange={(event) =>
                        setAlternativeTemperature(
                          event.target.value as AsphaltTemperature,
                        )
                      }
                    >
                      <option>Niedertemperaturasphalt</option>
                      <option>Heissasphalt</option>
                    </select>
                  </label>
                </div>
              ) : null}
              <div className="dual-field-grid quantity-field">
                <label className="field">
                  <span>Menge Bauherrenvariante</span>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={requestedQuantity}
                      onChange={(event) =>
                        setRequestedQuantity(Number(event.target.value))
                      }
                    />
                    <strong>{requestedProduct.unit}</strong>
                  </div>
                </label>
                <label className="field alternative-field">
                  <span>Menge Kästli-Alternative</span>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={alternativeQuantity}
                      onChange={(event) =>
                        setAlternativeQuantity(Number(event.target.value))
                      }
                    />
                    <strong>{alternativeProduct.unit}</strong>
                  </div>
                </label>
              </div>
            </article>

            <article className="input-card transport-card">
              <div className="section-number">02</div>
              <div className="section-copy">
                <p className="eyebrow">BAUSTELLENTRANSPORT</p>
                <h2>Wohin wird geliefert?</h2>
              </div>
              <label className="field">
                <span>Baustellenname / Projektbezeichnung</span>
                <input
                  type="text"
                  value={projectName}
                  placeholder="z. B. Entflechtung Gümligen Süd"
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </label>
              <div className="field location-field" ref={locationBox}>
                <span>PLZ oder Ort</span>
                <input
                  type="search"
                  value={locationQuery}
                  placeholder="z. B. 3011 Bern"
                  autoComplete="off"
                  onFocus={() => setLocationOpen(true)}
                  onChange={(event) => {
                    setLocationQuery(event.target.value);
                    setSelectedLocation(null);
                    setLocationOpen(true);
                  }}
                  aria-expanded={locationOpen}
                  aria-controls="location-suggestions"
                  aria-autocomplete="list"
                  role="combobox"
                />
                {locationOpen && locationSuggestions.length ? (
                  <div
                    className="suggestions"
                    id="location-suggestions"
                    role="listbox"
                  >
                    {locationSuggestions.map((location) => (
                      <button
                        key={`${location.postcode}-${location.place}`}
                        onClick={() => chooseLocation(location)}
                        role="option"
                        aria-selected={false}
                      >
                        <span>
                          <strong>{location.postcode}</strong>{" "}
                          {location.place}
                        </span>
                        <small>
                          {preciseNumber.format(location.distance)} km
                        </small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <label className="field">
                <span>Kürzeste Strecke ab Rubigen</span>
                <div className="input-with-unit">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={distance}
                    onChange={(event) =>
                      setDistance(Number(event.target.value))
                    }
                  />
                  <strong>km</strong>
                </div>
                <small className="field-help">
                  Automatisch aus der PLZ-/Ortsliste, manuell anpassbar.
                </small>
              </label>
              <div className="transport-summary">
                <div>
                  <span>Gewicht Bauherr</span>
                  <strong>
                    {number.format(calculations.requestedWeight)} t
                  </strong>
                </div>
                <div>
                  <span>Fuhren Bauherr</span>
                  <strong>{calculations.requestedTrips}</strong>
                </div>
                <div>
                  <span>Gewicht Kästli</span>
                  <strong>
                    {number.format(calculations.alternativeWeight)} t
                  </strong>
                </div>
                <div>
                  <span>Fuhren Kästli</span>
                  <strong>{calculations.alternativeTrips}</strong>
                </div>
              </div>
              <p className="method-note">
                40-t-Dieselfahrzeug ·{" "}
                {preciseNumber.format(calculations.payload)} t Nutzlast ·{" "}
                Hin und zurück{" "}
                {number.format(
                  distance * calculations.roundTripFactor,
                )}{" "}
                km je Fuhre ·{" "}
                {preciseNumber.format(calculations.truckFactor)} kg
                CO₂e/Fz-km
              </p>
            </article>
          </section>

          <div className="notice emissions-notice">
            Bei den Produktwerten werden ausschliesslich
            Herstellungsemissionen (A1–A3) in kg CO₂e berücksichtigt. Der
            separat ausgewiesene Baustellentransport wird zusätzlich
            eingerechnet; Entsorgung und Lebensende sind nicht enthalten.
          </div>

          <section className="results-section" aria-labelledby="results-title">
            <div className="results-heading">
              <div>
                <p className="eyebrow">03 · ERGEBNIS</p>
                <h2 id="results-title">Der direkte Variantenvergleich</h2>
              </div>
              <button
                className="primary-button"
                onClick={exportWord}
                disabled={
                  exporting ||
                  calculations.requestedAmount <= 0 ||
                  calculations.alternativeAmount <= 0 ||
                  !dataReady
                }
              >
                {exporting ? "Word wird erstellt…" : "Word-Beilage"}
              </button>
            </div>

            {!dataReady ? (
              <div className="notice warning-notice" role="status">
                Für mindestens eine gewählte Sorte fehlt im Kalkulationssheet
                noch der CO₂-Referenzwert. Das Produkt ist vollständig im
                Stammdatenkatalog enthalten; ergänzen Sie den Wert im
                Adminbereich, bevor Sie vergleichen oder exportieren.
              </div>
            ) : null}

            <div className="comparison-grid">
              <article className="comparison-column requested">
                <div className="variant-kicker">BAUHERRENVARIANTE</div>
                <h3>{requestedProduct.name}</h3>
                <p>
                  {requestedProduct.variant}
                  {category === "Asphalt"
                    ? ` · ${requestedTemperature}`
                    : ""}
                </p>
                <div className="discount-field">
                  <label htmlFor="requested-discount">Rabatt</label>
                  <div className="input-with-unit compact">
                    <input
                      id="requested-discount"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={requestedDiscount}
                      onChange={(event) =>
                        setRequestedDiscount(Number(event.target.value))
                      }
                    />
                    <strong>%</strong>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Produktpreis</dt>
                    <dd>
                      {money.format(requestedProduct.price)} /{" "}
                      {requestedProduct.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Netto-Einheitspreis</dt>
                    <dd>
                      {money.format(calculations.requestedNetUnit)} /{" "}
                      {requestedProduct.unit}
                    </dd>
                  </div>
                  <div className="total-row">
                    <dt>Totalpreis</dt>
                    <dd>
                      {money.format(calculations.requestedPriceTotal)}
                    </dd>
                  </div>
                  <div>
                    <dt>CO₂ Herstellung</dt>
                    <dd>
                      {requestedProduct.gwp === null
                        ? "Wert fehlt"
                        : `${number.format(
                            calculations.requestedMaterialCo2,
                          )} kg`}
                    </dd>
                  </div>
                  <div>
                    <dt>CO₂ Transport</dt>
                    <dd>
                      {number.format(
                        calculations.requestedTransportCo2,
                      )}{" "}
                      kg
                    </dd>
                  </div>
                  <div className="total-row">
                    <dt>CO₂ gesamt</dt>
                    <dd>
                      {requestedProduct.gwp === null
                        ? "Nicht berechenbar"
                        : `${number.format(
                            calculations.requestedCo2Total,
                          )} kg CO₂e`}
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="comparison-column alternative">
                <div className="variant-kicker">KÄSTLI-ALTERNATIVE</div>
                <h3>{alternativeProduct.name}</h3>
                <p>
                  {alternativeProduct.variant}
                  {category === "Asphalt"
                    ? ` · ${alternativeTemperature}`
                    : ""}
                </p>
                <div className="discount-field">
                  <label htmlFor="alternative-discount">Rabatt</label>
                  <div className="input-with-unit compact">
                    <input
                      id="alternative-discount"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={alternativeDiscount}
                      onChange={(event) =>
                        setAlternativeDiscount(Number(event.target.value))
                      }
                    />
                    <strong>%</strong>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Produktpreis</dt>
                    <dd>
                      {money.format(alternativeProduct.price)} /{" "}
                      {alternativeProduct.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Netto-Einheitspreis</dt>
                    <dd>
                      {money.format(calculations.alternativeNetUnit)} /{" "}
                      {alternativeProduct.unit}
                    </dd>
                  </div>
                  <div className={`total-row ${priceResult}`}>
                    <dt>Totalpreis</dt>
                    <dd>
                      {money.format(calculations.alternativePriceTotal)}
                    </dd>
                  </div>
                  <div>
                    <dt>CO₂ Herstellung</dt>
                    <dd>
                      {alternativeProduct.gwp === null
                        ? "Wert fehlt"
                        : `${number.format(
                            calculations.alternativeMaterialCo2,
                          )} kg`}
                    </dd>
                  </div>
                  <div>
                    <dt>CO₂ Transport</dt>
                    <dd>
                      {number.format(
                        calculations.alternativeTransportCo2,
                      )}{" "}
                      kg
                    </dd>
                  </div>
                  <div className={`total-row ${co2Result}`}>
                    <dt>CO₂ gesamt</dt>
                    <dd>
                      {alternativeProduct.gwp === null
                        ? "Nicht berechenbar"
                        : `${number.format(
                            calculations.alternativeCo2Total,
                          )} kg CO₂e`}
                    </dd>
                  </div>
                </dl>
              </article>
            </div>

            {dataReady ? (
              <>
                <div className="impact-strip">
                  <article className={co2Result}>
                    <span>CO₂-Unterschied</span>
                    <strong>
                      {calculations.co2Difference > 0 ? "+" : ""}
                      {number.format(calculations.co2Difference)} kg CO₂e
                    </strong>
                    <small>
                      {number.format(calculations.co2DifferencePercent)} %{" "}
                      {calculations.co2Difference < 0
                        ? "weniger"
                        : calculations.co2Difference > 0
                          ? "mehr"
                          : "gleich"}
                    </small>
                  </article>
                  <article className={priceResult}>
                    <span>Preisunterschied</span>
                    <strong>
                      {calculations.priceDifference > 0 ? "+" : ""}
                      {money.format(calculations.priceDifference)}
                    </strong>
                    <small>
                      nach Rabatt, exkl. MWST und Transportkosten
                    </small>
                  </article>
                  <article>
                    <span>Transport CO₂ Kästli</span>
                    <strong>
                      {number.format(
                        calculations.alternativeTransportCo2,
                      )}{" "}
                      kg
                    </strong>
                    <small>
                      {calculations.alternativeTrips} volle Fuhre
                      {calculations.alternativeTrips === 1 ? "" : "n"}
                    </small>
                  </article>
                </div>

                <div className="charts-grid">
                  <ComparisonBars
                    title="Preisvergleich"
                    unit="CHF · NACH RABATT"
                    requested={calculations.requestedPriceTotal}
                    alternative={calculations.alternativePriceTotal}
                    format={(value) => money.format(value)}
                  />
                  <ComparisonBars
                    title="CO₂-Belastung"
                    unit="KG CO₂E · HERSTELLUNG + TRANSPORT"
                    requested={calculations.requestedCo2Total}
                    alternative={calculations.alternativeCo2Total}
                    format={(value) => `${number.format(value)} kg`}
                  />
                </div>
              </>
            ) : null}

            {exportNotice ? (
              <div className="notice" role="status">
                {exportNotice}
              </div>
            ) : null}
          </section>

          <section className="sources-section">
            <div>
              <p className="eyebrow">NACHVOLLZIEHBAR</p>
              <h2>Datengrundlage</h2>
            </div>
            <div className="source-links">
              <a href={PRICE_SOURCE_URL} target="_blank" rel="noreferrer">
                Kästli Preisliste 2026
              </a>
              <a href={ASPHALT_SOURCE_URL} target="_blank" rel="noreferrer">
                Asphaltrechner
              </a>
              <a href={CONCRETE_SOURCE_URL} target="_blank" rel="noreferrer">
                Betonrechner
              </a>
              <a href={KBOB_SOURCE_URL} target="_blank" rel="noreferrer">
                KBOB Transportfaktor
              </a>
            </div>
            <p>
              Der Katalog umfasst 65 Asphalt- und 31 Betonsorten aus dem
              Kalkulationssheet. Preise und CO₂-Werte gehören jeweils direkt
              zum einzelnen Produkt; beide Varianten werden frei aus demselben
              Katalog gewählt. Für die Produkte werden ausschliesslich die
              Herstellungsemissionen A1–A3 verwendet.
            </p>
          </section>
        </main>
      ) : isAdmin ? (
        <main className="admin-main">
          <section className="admin-hero">
            <div>
              <p className="eyebrow">ADMIN-BACKEND</p>
              <h1>Stammdaten pflegen</h1>
              <p>
                Produktpreise, CO₂-Werte und Transportannahmen zentral
                aktualisieren.
              </p>
            </div>
            <div className="admin-actions">
              <button className="secondary-button" onClick={exportCsv}>
                CSV exportieren
              </button>
              <label className="secondary-button file-button">
                CSV importieren
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) importCsv(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <button
                className="primary-button"
                onClick={saveCatalog}
                disabled={isSaving}
              >
                {isSaving ? "Speichert…" : "Alles speichern"}
              </button>
            </div>
          </section>

          {catalogNotice ? (
            <div className="notice" role="status">
              {catalogNotice}
            </div>
          ) : null}

          <section className="admin-section">
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">PRODUKTKATALOG</p>
                <h2>
                  {adminProducts.length} Produkte · {asphaltCount} Asphalt ·{" "}
                  {concreteCount} Beton
                </h2>
              </div>
              <button className="secondary-button" onClick={addProduct}>
                Produkt hinzufügen
              </button>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Aktiv</th>
                    <th>Kategorie</th>
                    <th>Produkt</th>
                    <th>Variante / Referenz</th>
                    <th>Produktpreis</th>
                    <th>CO₂ Herstellung</th>
                    <th>Dichte</th>
                    <th>Quelle</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {adminProducts
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((product) => (
                      <tr key={product.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={product.active}
                            onChange={(event) =>
                              updateAdminProduct(
                                product.id,
                                "active",
                                event.target.checked,
                              )
                            }
                            aria-label={`${product.name} aktiv`}
                          />
                        </td>
                        <td>
                          <select
                            value={product.category}
                            onChange={(event) => {
                              const next =
                                event.target.value === "Beton"
                                  ? "Beton"
                                  : "Asphalt";
                              updateAdminProduct(
                                product.id,
                                "category",
                                next,
                              );
                              updateAdminProduct(
                                product.id,
                                "unit",
                                next === "Beton" ? "m³" : "t",
                              );
                            }}
                          >
                            <option>Asphalt</option>
                            <option>Beton</option>
                          </select>
                          <small>{product.unit}</small>
                        </td>
                        <td>
                          <input
                            value={product.name}
                            onChange={(event) =>
                              updateAdminProduct(
                                product.id,
                                "name",
                                event.target.value,
                              )
                            }
                          />
                        </td>
                        <td>
                          <textarea
                            value={product.variant}
                            onChange={(event) =>
                              updateAdminProduct(
                                product.id,
                                "variant",
                                event.target.value,
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={product.price}
                            onChange={(event) =>
                              updateAdminProduct(
                                product.id,
                                "price",
                                Number(event.target.value),
                              )
                            }
                          />
                          <small>CHF/{product.unit}</small>
                        </td>
                        <td>
                          <input
                            className={
                              product.gwp === null ? "missing-value" : ""
                            }
                            type="number"
                            step="0.001"
                            value={product.gwp ?? ""}
                            placeholder="fehlt"
                            onChange={(event) =>
                              updateAdminProduct(
                                product.id,
                                "gwp",
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                              )
                            }
                          />
                          <small>
                            kg CO₂e/{product.unit}
                            {product.category === "Asphalt"
                              ? " · Heissasphalt"
                              : " · A1–A3"}
                          </small>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.001"
                            value={product.density}
                            onChange={(event) =>
                              updateAdminProduct(
                                product.id,
                                "density",
                                Number(event.target.value),
                              )
                            }
                          />
                          <small>t/{product.unit}</small>
                        </td>
                        <td>
                          <textarea
                            value={product.sourceNote}
                            onChange={(event) =>
                              updateAdminProduct(
                                product.id,
                                "sourceNote",
                                event.target.value,
                              )
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="delete-button"
                            onClick={() =>
                              setAdminProducts((current) =>
                                current.filter(
                                  (candidate) =>
                                    candidate.id !== product.id,
                                ),
                              )
                            }
                            aria-label={`${product.name} entfernen`}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section settings-section">
            <div className="admin-section-heading">
              <div>
                <p className="eyebrow">TRANSPORTMODELL</p>
                <h2>Globale Annahmen</h2>
              </div>
            </div>
            <div className="settings-grid">
              {adminSettings
                .filter((setting) => !setting.key.startsWith("_"))
                .map((setting) => (
                <label className="setting-card" key={setting.key}>
                  <span>{setting.label}</span>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      step="0.001"
                      value={setting.value}
                      onChange={(event) =>
                        updateAdminSetting(
                          setting.key,
                          Number(event.target.value),
                        )
                      }
                    />
                    <strong>{setting.unit}</strong>
                  </div>
                  <small>{setting.source}</small>
                </label>
                ))}
            </div>
          </section>

          <section className="admin-section sync-section">
            <p className="eyebrow">DATENAKTUALISIERUNG</p>
            <h2>Kontrollierte Synchronisierung</h2>
            <p>
              Die externen Asphalt- und Betonrechner stellen derzeit keine
              dokumentierte, stabile und versionierte Schnittstelle für einen
              produktiven Live-Abgleich bereit. Darum bleiben die fachlich
              geprüften Snapshots die verlässliche Basis. Der Katalog lässt
              sich gesammelt per CSV aktualisieren; eine automatische
              Synchronisierung kann ergänzt werden, sobald die Anbieter einen
              verbindlichen Datenzugang freigeben.
            </p>
          </section>
        </main>
      ) : null}
    </div>
  );
}

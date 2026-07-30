import Link from "next/link";
import { getAdminUser } from "../chatgpt-auth";
import CalculatorApp from "../components/calculator-app";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    return (
      <main className="admin-main">
        <section className="admin-hero">
          <div>
            <p className="eyebrow">ADMIN-BACKEND</p>
            <h1>Zugriff geschützt</h1>
            <p>
              Der Adminbereich ist ausschliesslich über die freigegebene
              Cloudflare-Access-Anmeldung erreichbar.
            </p>
          </div>
          <Link className="secondary-button" href="/">
            Zum Variantenvergleich
          </Link>
        </section>
      </main>
    );
  }

  return (
    <CalculatorApp
      adminSignInPath="/admin"
      initialView="admin"
      isAdmin
    />
  );
}

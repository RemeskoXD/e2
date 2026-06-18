export default function AdminSettings() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-[#132333] mb-2">Nastavení e-shopu</h1>
      <p className="text-gray-500 mb-8">
        Základní provozní informace. Rozšířené napojení (DPH na faktuře, platební brána) lze doplnit
        později.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-6">
        <section>
          <h2 className="font-bold text-[#132333] mb-2">DPH a zobrazení cen</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            V katalogu a u objednávek se zjednodušeně pracuje rovnou s cenami <strong>vč. DPH</strong>. Na faktuře musí být DPH vždy uvedeno zvlášť podle vašeho
            účetního nastavení.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-[#132333] mb-2">Kontakt na obchod</h2>
          <p className="text-sm text-gray-600">
            Veřejné údaje (telefon, e-mail) upravte v šabloně webu — např. v komponentě záhlaví a
            stránce kontakt.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-[#132333] mb-2">Technické</h2>
          <p className="text-sm text-gray-600">
            Přihlášení do administrace: proměnné prostředí{' '}
            <code className="bg-gray-100 px-1 rounded">ADMIN_PASSWORD</code> a{' '}
            <code className="bg-gray-100 px-1 rounded">ADMIN_TOKEN</code> (doporučeno na produkci).
            Kompletní přehled proměnných je v souboru <code className="bg-gray-100 px-1 rounded">.env.example</code> v kořenu
            projektu.
          </p>
        </section>
        <section>
          <h2 className="font-bold text-[#132333] mb-2">Checklist před ostrým provozem</h2>
          <ul className="text-sm text-gray-600 list-disc pl-5 space-y-2">
            <li>
              <code className="bg-gray-100 px-1 rounded">npm run build</code>, potom{' '}
              <code className="bg-gray-100 px-1 rounded">npm run start:prod</code> (nebo nastavit{' '}
              <code className="bg-gray-100 px-1 rounded">NODE_ENV=production</code> u hostitele).
            </li>
            <li>
              HTTPS přes reverse proxy, zálohy PostgreSQL (snapshot u poskytovatele nebo pravidelný{' '}
              <code className="bg-gray-100 px-1 rounded">pg_dump</code>) — viz <code className="bg-gray-100 px-1 rounded">DEPLOY.md</code>.
            </li>
            <li>
              Doplnit texty na stránkách obchodních podmínek a ochrany údajů (patička e-shopu) podle vaší firmy.
            </li>
            <li>
              Vyplnit <code className="bg-gray-100 px-1 rounded">DATABASE_URL</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">ADMIN_PASSWORD</code>, ideálně{' '}
              <code className="bg-gray-100 px-1 rounded">ADMIN_TOKEN</code>.
            </li>
            <li>
              U veřejné domény nastavit <code className="bg-gray-100 px-1 rounded">CORS_ORIGIN</code> na URL e-shopu.
            </li>
            <li>
              Monitoring: <code className="bg-gray-100 px-1 rounded">GET /api/health</code> (stav DB + prostředí).
            </li>
            <li>
              Nové objednávky se zapisují do logu serveru řádkem začínajícím na{' '}
              <code className="bg-gray-100 px-1 rounded">[order]</code> — vhodné sledovat v Coolify / Dockeru.
            </li>
            <li>
              E-mail zákazníkovi a kopie obchodu: proměnné SMTP v <code className="bg-gray-100 px-1 rounded">.env.example</code>.
              Alternativa: <code className="bg-gray-100 px-1 rounded">ORDER_WEBHOOK_URL</code> pro automatizaci.
            </li>
            <li>
              <strong>Platby online</strong> v tomto projektu nejsou integrované — objednávka je závazná až po vašem
              potvrzení / proforma / faktura dle vašeho procesu. Bránu (GoPay, Stripe, Comgate) lze doplnit později.
            </li>
            <li>
              Stejně tak <strong>doprava a sklad</strong> řešíte mimo systém, dokud nenapojíte dopravce nebo skladový modul.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

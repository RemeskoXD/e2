/** Společná navigace mezi právními stránkami (Fáze A — integrace dokumentů). */
export default function LegalNav() {
  const link = 'text-[#CCAD8A] font-semibold hover:underline';
  return (
    <nav
      className="flex flex-wrap gap-x-5 gap-y-2 text-sm mb-8 pb-6 border-b border-gray-200"
      aria-label="Právní dokumenty"
    >
      <a href="#/obchodni-podminky" className={link}>
        Obchodní podmínky
      </a>
      <a href="#/ochrana-udaju" className={link}>
        Ochrana údajů
      </a>
      <a href="#/cookies" className={link}>
        Cookies
      </a>
      <a href="#/odstoupeni" className={link}>
        Odstoupení od smlouvy
      </a>
    </nav>
  );
}

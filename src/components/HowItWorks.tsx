import { Ruler, Sliders, Truck, PenTool } from 'lucide-react';

export default function HowItWorks() {
  const steps = [
    {
      icon: <Ruler className="text-[#CCAD8A] w-8 h-8" />,
      title: "1. Zaměření",
      desc: "Podle našich jednoduchých videonávodů si stínění hravě zaměříte sami s přesností na milimetr."
    },
    {
      icon: <Sliders className="text-[#CCAD8A] w-8 h-8" />,
      title: "2. Konfigurace",
      desc: "V online konfigurátoru si vyberete typ, barvu, rozměry a příslušenství. Cenu vidíte ihned."
    },
    {
      icon: <Truck className="text-[#CCAD8A] w-8 h-8" />,
      title: "3. Výroba a doprava",
      desc: "Vaši objednávku předáme do výroby a v dohodnutém termínu vám přijde spolehlivě až domů."
    },
    {
      icon: <PenTool className="text-[#CCAD8A] w-8 h-8" />,
      title: "4. Snadná montáž",
      desc: "S připraveným materiálem a našimi manuály zvládnete montáž během chvilky i svépomocí."
    }
  ];

  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#132333] tracking-tight mb-4">
            Jak to celé funguje?
          </h2>
          <p className="text-lg text-gray-500">
            Od první myšlenky po namontovanou žaluzii. Rychle, jednoduše a z pohodlí domova.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
          {steps.map((step, idx) => (
            <div key={idx} className="relative flex flex-col items-center text-center group">
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-[2px] bg-gray-100">
                  <div className="w-0 h-full bg-[#CCAD8A] group-hover:w-full transition-all duration-1000 ease-out"></div>
                </div>
              )}
              
              <div className="w-20 h-20 bg-[#F6F8F9] rounded-full flex items-center justify-center mb-6 z-10 group-hover:scale-110 group-hover:bg-[#132333] transition-all duration-300 shadow-sm">
                {step.icon}
              </div>
              <h3 className="text-xl font-bold text-[#132333] mb-3">{step.title}</h3>
              <p className="text-gray-500">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

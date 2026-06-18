import { execSync } from "child_process";
const scripts = [
  "import:cenik:horizontalni",
  "import:cenik:plise",
  "import:cenik:vertikalni",
  "import:xlsx:cenik",
  "import:xlsx:dn-roletky",
  "import:pdf:ext50-int50",
  "import:screenova:roleta:union-l",
  "import:textilni:zaluzie:jazz",
  "import:pdf:venkovni-rolety-radix"
];
for (const s of scripts) {
  console.log(`\n=== Running: npm run ${s} ===`);
  try {
    execSync(`npm run ${s}`, { stdio: "inherit" });
  } catch (err) {
    console.error(`Script ${s} failed.`);
    process.exit(1);
  }
}
console.log("\nVšechno proběhlo úspěšně!");

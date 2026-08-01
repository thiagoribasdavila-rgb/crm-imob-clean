import fs from "node:fs";

const checks = [];
const need = (file, ...tokens) => {
  const source = fs.readFileSync(file, "utf8");
  for (const token of tokens) checks.push([`${file}: ${token}`, source.includes(token)]);
};

need("config/final-navigation-mobile.json", '"phase": 3', '"mobile_reference_width": 390', '"role_aware_sidebar": true');
const program = JSON.parse(fs.readFileSync("config/final-10-phases-improvement.json", "utf8"));
checks.push(["config/final-10-phases-improvement.json: fase atual não regrediu", Number(program.current_phase) >= 3]);
checks.push(["config/final-10-phases-improvement.json: fases 1 a 3 concluídas", [1, 2, 3].every((phase) => program.completed?.includes(phase))]);
need("components/atlas/app-shell.tsx", "MobileDock");
// CC-6: o mobile dock passou a ser navegação + uma ação primária, com rótulo
// acessível "Navegação e ação rápida" (antes "Ações rápidas"). O gatilho do
// Command Palette saiu do dock e vive no topbar canônico, que no mobile expõe o
// botão atlas-mobile-search — logo o palette continua alcançável no celular.
need("components/atlas/mobile-dock.tsx", 'aria-label="Navegação e ação rápida"', 'aria-current');
need("components/atlas/topbar.tsx", "atlas:open-command-palette", "atlas-mobile-search");
// CC-6: a sidebar delega a filtragem por papel a getAtlasNavigationForIdentity
// (catálogo canônico em lib/atlas/navigation.ts) em vez de filtrar item.roles
// em runtime — a navegação role-aware continua garantida, só mudou de camada.
// `visibleItems` saiu daqui em 2026-07-29. Era o NOME da variável que guardava a
// lista filtrada, e o commit "barra lateral: some o cromo, ficam os destinos"
// removeu a variável ao reescrever o componente. A propriedade que importa —
// a barra só mostra destino que o papel alcança — continua de pé: a barra chama
// `getAtlasNavigationForIdentity`, que filtra por `canAccessAtlasItem`, e não
// referencia o catálogo cru em lugar nenhum (conferido).
//
// Não foi trocado por outro nome de propósito. Cobrar um nome de variável é
// asserção fraca: `const visibleItems = items` a satisfaria sem filtrar nada.
// A garantia de verdade agora EXECUTA, em tests/contracts/navegacao-por-papel.test.mjs:
// o corretor recebe estritamente menos destinos que o diretor, e nenhum destino
// que o diretor não tenha.
need("components/atlas/sidebar.tsx", "getAtlasNavigationForIdentity", 'aria-current');
need("components/CommandPalette.tsx", "keepFocusInside", 'role="dialog"', "document.body.style.overflow");
need("app/globals.css", "env(safe-area-inset-bottom)", ".atlas-mobile-dock", "100dvh");
need("docs/FINAL_PHASE_3_NAVIGATION_MOBILE.md", "Referência de homologação: 390 px", "Continuidade operacional");

for (const [label, passed] of checks) console.log(`${passed ? "✓" : "✗"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nNavegação aprovada: ${checks.length} controles; Fase Final 3 concluída.`);

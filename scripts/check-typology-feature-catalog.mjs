import{readFileSync}from"node:fs";import{resolve}from"node:path";const read=p=>readFileSync(resolve(process.cwd(),p),"utf8"),c=JSON.parse(read("config/typology-feature-catalog.json")),sql=read(c.migration).toLowerCase(),api=read(c.api),page=read(c.page),command=read(c.command),fail=[];for(const marker of["development_typologies","development_features","development_catalog_events","upsert_development_catalog_item","catalog_actor_forbidden","catalog_typology_price_range_invalid","catalog_typology_units_invalid","catalog_feature_source_required","matchingready","aiready"])if(!sql.includes(marker))fail.push(`banco incompleto: ${marker}`);for(const marker of["requireAccessContext","canManage","upsert_development_catalog_item","matchingReady:true","aiReady:true","developments.catalog_saved"])if(!api.includes(marker))fail.push(`API incompleta: ${marker}`);for(const marker of['data-phase="63-typology-feature-catalog"',"Tipologias estruturadas","Diferenciais do projeto","Fonte verificada","Salvar tipologia","Salvar diferencial"])if(!page.includes(marker))fail.push(`experiência incompleta: ${marker}`);/* ── REVISÃO 2026-08-02: A ASSERÇÃO CONFERIA A GRAFIA, NÃO A PROPRIEDADE ──────
   Ela exigia o literal "/catalog" no fonte da página de comando. O passe de
   experiência trocou uma lista de <Link href={`/developments/${id}/catalog`}>
   por uma lista dirigida a dados — { slug: "catalog", label: "Tipologias e
   diferenciais" } — composta depois. A ROTA continuou existindo e funcionando; o
   literal deixou de aparecer, e o portão acendeu contra um refactor correto.
   É a terceira vez no mesmo dia que esta classe aparece (o portão da marca
   exigia `const GRAD_ID`; o do copiloto noturno exigia a grafia sem espaço).
   Trava contra manutenção ensina a não mexer, ou a desfazer para devolver o
   verde.
   Agora cobra a PROPRIEDADE: existe uma entrada de navegação para o catálogo,
   escrita em qualquer das duas formas, E ela vem com o rótulo. Exigir os dois
   juntos é mais forte que exigir o caminho solto, porque uma entrada sem rótulo
   seria um link que ninguém acha. ────────────────────────────────────────── */
const entradaLiteral = command.includes("/catalog");
const entradaPorSlug = /slug:\s*"catalog"/.test(command);
if((!entradaLiteral&&!entradaPorSlug)||!command.includes("Tipologias e diferenciais"))fail.push("entrada no comando ausente: nem `/catalog` nem `slug: \"catalog\"` com o rotulo");if(fail.length){console.error("CATÁLOGO Fase 63: REPROVADA");for(const f of fail)console.error(`- ${f}`);process.exit(1)}console.log("CATÁLOGO Fase 63: aprovado — tipologias para matching e diferenciais verificados para IA comercial.");

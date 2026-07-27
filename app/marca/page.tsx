import type { CSSProperties } from "react";

/**
 * ESCOLHA DA MARCA — página temporária de comparação.
 *
 * Existe para uma decisão ser tomada olhando, não imaginando: cada proposta
 * aparece nos quatro tamanhos em que a marca de fato vive (96 de apresentação,
 * 44 do login, 32 da barra lateral, 16 do favicon) e sobre fundo escuro e claro.
 *
 * Apagar depois de escolhida. Não está no menu de propósito.
 */

export const metadata = { title: "Atlas · escolha da marca" };

const DE = "#3ae7d7";
const PARA = "#8b8cff";

type Proposta = {
  chave: string;
  nome: string;
  ideia: string;
  porque: string;
  desenho: (id: string) => React.ReactNode;
};

const PROPOSTAS: Proposta[] = [
  {
    chave: "bussola",
    nome: "Agulha",
    ideia: "A agulha da bússola. Norte cheio, sul apagado.",
    porque:
      "Atlas é livro de mapas. A agulha diz navegação e prioridade — para onde ir — sem depender de detalhe: a 16px continua sendo uma seta vertical com topo aceso.",
    desenho: (id) => (
      <>
        <path d="M50 6 L64 52 L36 52 Z" fill={`url(#${id})`} />
        <path d="M50 94 L64 52 L36 52 Z" fill={`url(#${id})`} opacity="0.28" />
      </>
    ),
  },
  {
    chave: "torre",
    nome: "Prumo",
    ideia: "Três lajes que estreitam para cima, com folga entre elas.",
    porque:
      "Fala de imóvel sem desenhar um prédio literal. A folga entre as lajes é o que sobrevive ao tamanho pequeno — vira três traços, e três traços empilhados ainda são uma torre.",
    desenho: (id) => (
      <>
        <rect x="22" y="66" width="56" height="16" rx="3" fill={`url(#${id})`} />
        <rect x="30" y="42" width="40" height="16" rx="3" fill={`url(#${id})`} opacity="0.72" />
        <rect x="38" y="18" width="24" height="16" rx="3" fill={`url(#${id})`} opacity="0.46" />
      </>
    ),
  },
  {
    chave: "monograma",
    nome: "Monograma A",
    ideia: "O A de Atlas construído como um vão — duas pernas e o travessão.",
    porque:
      "A letra é a coisa mais específica que existe: nenhuma outra empresa tem o mesmo A com o mesmo corte. E o vão triangular lê como telhado sem ser desenho de casinha.",
    desenho: (id) => (
      <>
        <path d="M50 10 L84 90 L68 90 L50 44 L32 90 L16 90 Z" fill={`url(#${id})`} />
        <rect x="36" y="62" width="28" height="11" rx="2" fill={`url(#${id})`} />
      </>
    ),
  },
  {
    chave: "foco",
    nome: "Foco",
    ideia: "Um anel aberto e um ponto sólido dentro dele.",
    porque:
      "É o que o produto faz: entre muitos, apontar UM. A abertura no anel dá assimetria — é ela que impede o desenho de virar um alvo genérico.",
    desenho: (id) => (
      <>
        <path
          d="M50 12 A38 38 0 1 1 23 23"
          stroke={`url(#${id})`}
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="50" cy="50" r="13" fill={`url(#${id})`} />
      </>
    ),
  },
  {
    chave: "atual",
    nome: "Atual (estrela)",
    ideia: "Estrela de quatro pontas com eixo vertical alongado.",
    porque:
      "Fica para comparação. O problema não é o desenho, é a saturação: a estrela de 4 pontas virou o símbolo padrão de qualquer produto com IA — ela diz 'tem IA' e não diz Atlas.",
    desenho: (id) => (
      <path
        d="M50,3 Q53.5,46.5 86,50 Q53.5,53.5 50,97 Q46.5,53.5 14,50 Q46.5,46.5 50,3 Z"
        fill={`url(#${id})`}
      />
    ),
  },
];

const TAMANHOS = [
  { px: 96, nota: "apresentação" },
  { px: 44, nota: "login" },
  { px: 32, nota: "barra lateral" },
  { px: 16, nota: "favicon" },
];

function Marca({ p, px, sufixo }: { p: Proposta; px: number; sufixo: string }) {
  const id = `grad-${p.chave}-${sufixo}`;
  return (
    <svg width={px} height={px} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={DE} />
          <stop offset="1" stopColor={PARA} />
        </linearGradient>
      </defs>
      {p.desenho(id)}
    </svg>
  );
}

const caixa: CSSProperties = {
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 14,
  padding: "22px 24px",
  marginBottom: 18,
  background: "rgba(255,255,255,.015)",
};

export default function EscolhaDaMarca() {
  return (
    <main style={{ maxWidth: 940, margin: "0 auto", padding: "48px 24px 80px", color: "#e8eef8" }}>
      <p style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "#7a8799", margin: 0 }}>
        Decisão de marca
      </p>
      <h1 style={{ fontSize: 30, letterSpacing: "-.03em", margin: "10px 0 8px" }}>
        Quatro caminhos, nos tamanhos reais de uso
      </h1>
      <p style={{ color: "#aab6ca", fontSize: 14, lineHeight: 1.6, maxWidth: "64ch", margin: "0 0 32px" }}>
        Cada marca aparece em 96, 44, 32 e 16 pixels — e sobre fundo claro, que é
        onde desenho frágil quebra. Escolha olhando o de 16: é o tamanho que
        aparece na aba do navegador, e o que sobrevive ali é o que a marca de fato
        é.
      </p>

      {PROPOSTAS.map((p) => (
        <section key={p.chave} style={caixa}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 17, margin: 0, letterSpacing: "-.02em" }}>{p.nome}</h2>
            <span style={{ color: "#7a8799", fontSize: 12 }}>{p.ideia}</span>
          </div>
          <p style={{ color: "#aab6ca", fontSize: 12.5, lineHeight: 1.6, maxWidth: "70ch", margin: "8px 0 18px" }}>
            {p.porque}
          </p>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 30, flexWrap: "wrap" }}>
            {TAMANHOS.map((t) => (
              <div key={t.px} style={{ textAlign: "center" }}>
                <Marca p={p} px={t.px} sufixo={`d${t.px}`} />
                <small style={{ display: "block", marginTop: 8, color: "#6b7890", fontSize: 10, fontFamily: "ui-monospace, monospace" }}>
                  {t.px}px · {t.nota}
                </small>
              </div>
            ))}
            <div style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
                <Marca p={p} px={44} sufixo="c44" />
                <Marca p={p} px={16} sufixo="c16" />
              </div>
              <small style={{ display: "block", marginTop: 8, color: "#55617a", fontSize: 10, fontFamily: "ui-monospace, monospace" }}>
                tema claro
              </small>
            </div>
          </div>

          {/* Com o wordmark, que é como a marca aparece no login e na barra. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.06)" }}>
            <Marca p={p} px={34} sufixo="w" />
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1 }}>
                Atlas
                <span style={{ backgroundImage: `linear-gradient(120deg, ${DE}, ${PARA})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  .
                </span>
              </span>
              <span style={{ marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: ".22em", color: "#6b7890" }}>
                Real Estate Intelligence
              </span>
            </span>
          </div>
        </section>
      ))}
    </main>
  );
}

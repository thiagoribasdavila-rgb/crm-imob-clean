import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell, LegalSection, LegalList } from "@/components/public/PublicPageShell";

export const metadata: Metadata = {
  title: "Exclusão de dados",
  description:
    "Como solicitar a exclusão dos seus dados pessoais tratados pelo Atlas AI, incluindo dados recebidos por formulários de anúncio da Meta e conversas de WhatsApp. Prazos, escopo e contato.",
  alternates: { canonical: "https://atlasaios.com.br/data-deletion" },
};

const UPDATED_AT = "21 de julho de 2026";
const CONTACT = "privacidade@atlasaios.com.br";

export default function DataDeletionPage() {
  return (
    <PublicPageShell
      eyebrow="Direitos do titular"
      title="Exclusão de dados"
      description="Você pode pedir a exclusão dos seus dados pessoais a qualquer momento, sem custo. Esta página explica como solicitar, o que é apagado, em quanto tempo e o que a lei nos obriga a manter."
      updatedAt={UPDATED_AT}
    >
      <LegalSection id="como" title="1. Como solicitar">
        <p>
          Envie um e-mail para{" "}
          <a className="text-[color:var(--atlas-accent)] underline-offset-4 hover:underline" href={`mailto:${CONTACT}?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20dados`}>
            {CONTACT}
          </a>{" "}
          com o assunto <strong className="text-[color:var(--atlas-text-primary)]">&ldquo;Solicitação de exclusão de dados&rdquo;</strong>, informando:
        </p>
        <LegalList
          items={[
            <>o <strong className="text-[color:var(--atlas-text-primary)]">telefone e/ou e-mail</strong> que você usou ao ser contatado (é como localizamos seu registro);</>,
            <>o nome da empresa/empreendimento com quem você falou, se lembrar;</>,
            <>se prefere a <strong className="text-[color:var(--atlas-text-primary)]">exclusão total</strong> ou apenas <strong className="text-[color:var(--atlas-text-primary)]">não ser mais contatado</strong>.</>,
          ]}
        />
        <p>
          Pedimos uma confirmação simples de identidade (responder do mesmo e-mail ou confirmar um dado do cadastro)
          apenas para não apagar dados da pessoa errada.
        </p>
      </LegalSection>

      <LegalSection id="meta" title="2. Se você veio de um anúncio do Facebook ou Instagram">
        <p>
          Quando você preenche um formulário instantâneo em um anúncio, seus dados vão para a empresa anunciante e
          chegam ao Atlas, que é a ferramenta de atendimento dela. Para apagar esses dados:
        </p>
        <LegalList
          items={[
            <>escreva para o endereço acima — isso cobre os dados recebidos via Meta e as conversas de WhatsApp;</>,
            <>
              você também pode remover a permissão do aplicativo nas configurações da sua conta Meta, em
              <strong className="text-[color:var(--atlas-text-primary)]"> Configurações → Aplicativos e sites</strong>. Isso interrompe novos
              envios, mas <em>não</em> apaga por si só o que já foi recebido — para apagar, faça a solicitação por e-mail.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="escopo" title="3. O que é apagado">
        <LegalList
          items={[
            <>dados de identificação e contato (nome, telefone, e-mail);</>,
            <>histórico de atendimento, tarefas, visitas e propostas vinculadas a você;</>,
            <>mensagens trocadas pelos canais integrados;</>,
            <>a memória comercial estruturada usada pela IA (intenção, objeção, estágio e próxima ação);</>,
            <>a origem de campanha associada ao seu registro.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="prazo" title="4. Prazo">
        <p>
          Confirmamos o recebimento em até <strong className="text-[color:var(--atlas-text-primary)]">5 dias úteis</strong> e concluímos a
          exclusão em até <strong className="text-[color:var(--atlas-text-primary)]">15 dias</strong>, salvo se a lei exigir prazo diverso.
          Backups de segurança são sobrescritos nos ciclos normais de retenção.
        </p>
      </LegalSection>

      <LegalSection id="excecoes" title="5. O que precisamos manter">
        <p>Mesmo após a exclusão, a lei pode exigir a guarda de um conjunto mínimo:</p>
        <LegalList
          items={[
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Registro de opt-out:</strong> guardamos o mínimo necessário (por
              exemplo, o telefone em forma protegida) exatamente para <em>garantir que você não volte a ser contatado</em>.
            </>,
            <>registros exigidos por obrigação legal ou regulatória, e para exercício de direitos em processo;</>,
            <>dados já anonimizados, que não permitem identificar você e não são considerados dados pessoais.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="outros" title="6. Outros direitos">
        <p>
          Além da exclusão, você pode pedir acesso, correção, portabilidade e revogação de consentimento. Veja a{" "}
          <Link className="text-[color:var(--atlas-accent)] underline-offset-4 hover:underline" href="/privacy">Política de Privacidade</Link>{" "}
          para a lista completa e as bases legais.
        </p>
        <p>
          Se a resposta não for satisfatória, você pode acionar a Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </LegalSection>
    </PublicPageShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell, LegalSection, LegalList } from "@/components/public/PublicPageShell";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description:
    "Termos de uso da plataforma Atlas AI: escopo do serviço, contas e papéis, uso aceitável, integrações de terceiros, natureza das sugestões de IA, responsabilidades e limitações.",
  alternates: { canonical: "https://atlasaios.com.br/terms" },
};

const UPDATED_AT = "21 de julho de 2026";
const CONTACT = "contato@atlasaios.com.br";

export default function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="Documento legal"
      title="Termos de Uso"
      description="Estes termos regem o acesso e o uso da plataforma Atlas AI por incorporadoras, imobiliárias e seus profissionais. Ao acessar a plataforma, o usuário declara que leu e concorda com estas condições."
      updatedAt={UPDATED_AT}
    >
      <LegalSection id="aceite" title="1. Aceite">
        <p>
          O uso da plataforma pressupõe a aceitação integral destes termos e da{" "}
          <Link className="text-sky-300 underline-offset-4 hover:underline" href="/privacy">Política de Privacidade</Link>.
          Se você não concorda, não utilize o serviço.
        </p>
        <p>
          O acesso é concedido a profissionais vinculados a uma empresa contratante. Condições comerciais específicas
          (escopo, prazo, preço, níveis de serviço) constam do contrato firmado com essa empresa e prevalecem em caso de
          conflito com estes termos gerais.
        </p>
      </LegalSection>

      <LegalSection id="servico" title="2. O que a plataforma faz">
        <p>
          O Atlas AI organiza a operação comercial imobiliária: recebe e distribui leads, registra o atendimento,
          acompanha o funil de vendas, integra campanhas de mídia e oferece <strong className="text-slate-200">sugestões
          geradas por inteligência artificial</strong> para apoiar decisões humanas.
        </p>
        <LegalList
          items={[
            <>Recepção de leads de formulários de anúncio e de canais de mensagem.</>,
            <>Distribuição, priorização e acompanhamento do atendimento comercial.</>,
            <>Relatórios de desempenho de campanha, custo por lead e evolução do funil.</>,
            <>Recomendações de próxima ação, de criativo e de verba, sempre sujeitas a aprovação humana.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="contas" title="3. Contas, papéis e credenciais">
        <LegalList
          items={[
            <>Cada usuário tem credencial pessoal e intransferível; o compartilhamento é vedado.</>,
            <>
              O acesso é definido por papel (diretoria, gestão, corretor, administração). O corretor enxerga apenas a
              própria carteira.
            </>,
            <>
              A empresa contratante é responsável por conceder, revisar e revogar acessos dos seus profissionais,
              inclusive no desligamento.
            </>,
            <>O usuário deve comunicar imediatamente qualquer suspeita de uso indevido da sua conta.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="responsabilidades" title="4. Responsabilidades da empresa contratante">
        <LegalList
          items={[
            <>
              Ser a <strong className="text-slate-200">controladora</strong> dos dados pessoais tratados na plataforma e
              possuir base legal para o tratamento, incluindo consentimento quando exigido.
            </>,
            <>
              Garantir a veracidade das informações comerciais publicadas (preço, disponibilidade, condições,
              características do imóvel).
            </>,
            <>
              Cumprir a legislação aplicável e as políticas das plataformas de mídia utilizadas, incluindo as regras de
              categoria especial de <em>Habitação</em>, que proíbem discriminação na segmentação e no anúncio.
            </>,
            <>Respeitar pedidos de descadastro e não contatar titulares que tenham revogado consentimento.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="uso-aceitavel" title="5. Uso aceitável">
        <p>É vedado, entre outras condutas:</p>
        <LegalList
          items={[
            <>importar ou tratar dados pessoais sem base legal, ou obtidos de forma irregular;</>,
            <>usar a plataforma para envio de mensagens não solicitadas em massa;</>,
            <>publicar anúncio discriminatório ou enganoso, ou que viole a política de habitação;</>,
            <>tentar burlar limites técnicos, engenharia reversa, acesso não autorizado ou extração automatizada em massa;</>,
            <>usar a plataforma para finalidade ilícita ou que viole direitos de terceiros.</>,
          ]}
        />
        <p>O descumprimento pode levar à suspensão do acesso, sem prejuízo das medidas cabíveis.</p>
      </LegalSection>

      <LegalSection id="ia" title="6. Natureza das sugestões de inteligência artificial">
        <p>
          As saídas da IA são <strong className="text-slate-200">apoio à decisão</strong>, não aconselhamento
          profissional, jurídico, financeiro ou de investimento.
        </p>
        <LegalList
          items={[
            <>Probabilidades e projeções são estimativas e podem errar; não constituem promessa de resultado.</>,
            <>
              Nenhuma ação com efeito externo é executada automaticamente: publicar ou alterar campanha, mudar verba e
              enviar mensagem exigem aprovação humana registrada.
            </>,
            <>A conferência de preço, disponibilidade e condições contratuais é sempre humana.</>,
            <>Não garantimos volume de leads, taxa de conversão ou resultado de vendas.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="terceiros" title="7. Integrações de terceiros">
        <p>
          A plataforma integra serviços de terceiros — entre eles Meta (Facebook, Instagram e WhatsApp Business),
          provedores de modelos de IA e infraestrutura em nuvem. O uso desses serviços está sujeito também aos termos e
          políticas dos respectivos fornecedores.
        </p>
        <p>
          Indisponibilidade, mudança de regras ou revogação de acesso por parte desses terceiros pode afetar
          funcionalidades dependentes da integração, sem que isso configure inadimplemento do Atlas.
        </p>
      </LegalSection>

      <LegalSection id="disponibilidade" title="8. Disponibilidade, manutenção e suporte">
        <LegalList
          items={[
            <>Podemos realizar manutenções programadas, com aviso sempre que possível.</>,
            <>Podemos evoluir, alterar ou descontinuar funcionalidades, preservando o essencial do serviço contratado.</>,
            <>Canais e prazos de suporte seguem o contrato firmado com a empresa contratante.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="propriedade" title="9. Propriedade intelectual">
        <p>
          O software, a marca, a interface, a documentação e os modelos de organização da informação do Atlas AI são de
          titularidade do Atlas ou de seus licenciadores. O contrato concede licença de uso limitada, não exclusiva e
          intransferível durante a vigência.
        </p>
        <p>
          Os <strong className="text-slate-200">dados comerciais e pessoais inseridos pela contratante permanecem dela</strong>,
          que pode exportá-los na forma prevista em contrato.
        </p>
      </LegalSection>

      <LegalSection id="limitacao" title="10. Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela lei, o Atlas não responde por lucros cessantes, perda de oportunidade
          comercial ou danos indiretos decorrentes do uso ou da impossibilidade de uso da plataforma, nem por decisões
          comerciais tomadas por usuários com apoio das sugestões da IA.
        </p>
        <p>Nada nestes termos exclui responsabilidades que a legislação aplicável não permita afastar.</p>
      </LegalSection>

      <LegalSection id="vigencia" title="11. Vigência e encerramento">
        <p>
          Estes termos vigoram enquanto durar o acesso. Encerrada a relação contratual, o acesso é desativado e os dados
          são tratados conforme o contrato e a{" "}
          <Link className="text-sky-300 underline-offset-4 hover:underline" href="/privacy">Política de Privacidade</Link>,
          respeitados os prazos legais de guarda.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="12. Alterações">
        <p>
          Podemos atualizar estes termos para refletir mudanças no produto ou na legislação. A data de última
          atualização consta no topo; alterações relevantes serão comunicadas à contratante.
        </p>
      </LegalSection>

      <LegalSection id="foro" title="13. Lei aplicável e foro">
        <p>
          Aplica-se a legislação brasileira. Fica eleito o foro do domicílio da contratante para dirimir controvérsias,
          salvo disposição diversa no contrato.
        </p>
      </LegalSection>

      <LegalSection id="contato" title="14. Contato">
        <p>
          Dúvidas sobre estes termos:{" "}
          <a className="text-sky-300 underline-offset-4 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </LegalSection>
    </PublicPageShell>
  );
}

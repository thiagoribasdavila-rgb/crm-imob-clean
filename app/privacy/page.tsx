import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell, LegalSection, LegalList } from "@/components/public/PublicPageShell";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como o Atlas AI trata dados pessoais de leads e clientes: finalidades, bases legais, operadores, retenção, uso de inteligência artificial e direitos do titular sob a LGPD.",
  alternates: { canonical: "https://atlasaios.com.br/privacy" },
};

const UPDATED_AT = "21 de julho de 2026";
const CONTACT = "privacidade@atlasaios.com.br";

export default function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="Documento legal"
      title="Política de Privacidade"
      description="Esta política explica quais dados pessoais o Atlas AI trata, com que finalidade, por quanto tempo, com quem compartilha e como o titular exerce seus direitos sob a Lei Geral de Proteção de Dados (Lei 13.709/2018)."
      updatedAt={UPDATED_AT}
    >
      <LegalSection id="papeis" title="1. Quem trata os dados">
        <p>
          O <strong className="text-[color:var(--atlas-text-primary)]">Atlas AI</strong> é uma plataforma de inteligência comercial imobiliária
          fornecida a incorporadoras e imobiliárias (&ldquo;cliente contratante&rdquo;).
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Controlador:</strong> a incorporadora ou imobiliária contratante, que
              decide quais dados coleta e para quê.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Operador:</strong> o Atlas AI, que trata os dados em nome do
              controlante, seguindo suas instruções e esta política.
            </>,
          ]}
        />
        <p>
          Quando você preenche um formulário de anúncio ou fala com um corretor, o controlador dos seus dados é a
          empresa anunciante. O Atlas é a ferramenta que ela usa para atender você.
        </p>
      </LegalSection>

      <LegalSection id="dados" title="2. Dados que tratamos">
        <LegalList
          items={[
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Identificação e contato:</strong> nome, telefone, e-mail.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Interesse comercial:</strong> empreendimento de interesse, faixa de
              orçamento informada, prazo de compra, forma de pagamento pretendida, região desejada — sempre conforme o
              que o próprio titular informa.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Histórico de atendimento:</strong> registros de contato, tarefas,
              visitas, propostas e o estágio da negociação.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Mensagens:</strong> conversas de WhatsApp trocadas com o corretor,
              quando esse canal é utilizado.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Origem:</strong> campanha, anúncio e formulário que originaram o
              contato.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Uso da plataforma</strong> (apenas para usuários corretores e
              gestores): identificação da conta, papel de acesso e registros de auditoria das ações realizadas.
            </>,
          ]}
        />
        <p>
          Não solicitamos dados sensíveis (origem racial, convicção religiosa, opinião política, saúde, biometria) e
          pedimos que não sejam enviados por nenhum canal.
        </p>
      </LegalSection>

      <LegalSection id="origem" title="3. De onde vêm os dados">
        <LegalList
          items={[
            <>Formulários instantâneos (Lead Ads) preenchidos voluntariamente em anúncios da Meta.</>,
            <>Conversas iniciadas pelo titular no WhatsApp com a empresa anunciante.</>,
            <>Cadastro manual feito por um corretor a partir de contato direto do interessado.</>,
            <>Importação de bases já pertencentes ao controlador, sob responsabilidade dele.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="finalidades" title="4. Para que usamos e com que base legal">
        <LegalList
          items={[
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Atender e responder o interessado</strong> — execução de procedimentos
              preliminares a contrato, a pedido do titular (art. 7º, V).
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Organizar o atendimento</strong> (distribuição ao corretor, priorização
              da fila, lembretes de retorno) — legítimo interesse do controlador em prestar atendimento adequado (art.
              7º, IX).
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Comunicação comercial ativa</strong> (abordagens e reativação de base) —
              consentimento do titular (art. 7º, I), revogável a qualquer momento.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Medir e melhorar campanhas</strong> — legítimo interesse, com dados
              agregados ou pseudonimizados sempre que suficiente.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Cumprir obrigações legais e regulatórias</strong> e exercer direitos em
              processo (art. 7º, II e VI).
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="ia" title="5. Como a inteligência artificial é usada">
        <p>
          O Atlas usa IA para <strong className="text-[color:var(--atlas-text-primary)]">priorizar e sugerir</strong> — nunca para decidir
          sozinho algo que afete direitos do titular.
        </p>
        <LegalList
          items={[
            <>
              A IA estima a probabilidade de conversão e sugere a próxima ação ao corretor. A decisão e o contato são
              sempre de uma pessoa.
            </>,
            <>
              Ações com efeito externo (enviar mensagem, publicar ou alterar campanha, mudar orçamento) exigem
              <strong className="text-[color:var(--atlas-text-primary)]"> aprovação humana registrada</strong>. Nada é executado automaticamente.
            </>,
            <>
              A memória comercial guarda <strong className="text-[color:var(--atlas-text-primary)]">sinais estruturados</strong> (intenção,
              objeção, estágio, próxima ação) e <strong className="text-[color:var(--atlas-text-primary)]">não armazena a conversa bruta</strong>.
            </>,
            <>
              O conteúdo dos anúncios não segmenta nem descreve características pessoais protegidas; campanhas
              imobiliárias operam sob a categoria especial de <em>Habitação</em> da Meta, que restringe segmentação por
              idade, gênero e localização detalhada.
            </>,
          ]}
        />
        <p>
          O titular pode solicitar revisão humana de qualquer priorização que o afete, nos termos do art. 20 da LGPD.
        </p>
      </LegalSection>

      <LegalSection id="meta" title="6. Integração com a Meta (Facebook, Instagram e WhatsApp)">
        <p>
          O Atlas AI opera um aplicativo na plataforma Meta para conectar os anúncios da empresa anunciante ao
          atendimento. Nessa integração:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Recebemos os leads</strong> gerados nos formulários instantâneos dos
              anúncios da própria empresa anunciante, para que o corretor possa responder.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Lemos e gerenciamos campanhas</strong> da conta de anúncios do
              contratante (desempenho, custo, criativos) para relatórios e recomendações — alterações só ocorrem após
              aprovação humana.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Enviamos eventos de conversão</strong> à Meta para medir resultado de
              campanha. Identificadores usados nesse envio são transmitidos de forma criptografada (hash), conforme a
              especificação da plataforma.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Trocamos mensagens de WhatsApp Business</strong> quando o titular
              inicia ou consente a conversa.
            </>,
          ]}
        />
        <p>
          O Atlas não vende dados, não os utiliza para publicidade de terceiros e não os combina com bases externas para
          criar perfis fora da relação comercial com o anunciante. O tratamento realizado pela própria Meta é regido
          pelas políticas dela.
        </p>
      </LegalSection>

      <LegalSection id="compartilhamento" title="7. Com quem compartilhamos">
        <p>Compartilhamos apenas o necessário, com operadores contratados e sujeitos a obrigações de segurança:</p>
        <LegalList
          items={[
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Supabase</strong> — banco de dados, autenticação e armazenamento de
              arquivos.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Meta Platforms</strong> — recebimento de leads, gestão de campanhas e
              eventos de conversão.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Provedores de modelos de IA</strong> — processamento de texto para
              gerar sugestões comerciais. Não são usados para treinar modelos de terceiros.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Provedor de hospedagem</strong> — execução da aplicação.
            </>,
            <>Autoridades públicas, quando houver obrigação legal ou ordem judicial.</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="retencao" title="8. Por quanto tempo guardamos">
        <LegalList
          items={[
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Dados do lead e histórico comercial:</strong> pelo tempo da relação com
              o controlador e pelos prazos legais aplicáveis; depois, eliminados ou anonimizados.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Memória comercial estruturada da IA:</strong> expira automaticamente em
              <strong className="text-[color:var(--atlas-text-primary)]"> 180 dias</strong> sem nova interação.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Registros de auditoria:</strong> mantidos pelo prazo necessário para
              comprovar a governança das ações.
            </>,
            <>
              <strong className="text-[color:var(--atlas-text-primary)]">Lista de exclusão (opt-out):</strong> mantemos o registro mínimo para
              garantir que o pedido de não contato seja respeitado.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection id="seguranca" title="9. Segurança">
        <LegalList
          items={[
            <>Tráfego criptografado (HTTPS) e credenciais nunca expostas ao navegador.</>,
            <>Isolamento por organização no banco de dados, com controle de acesso por papel.</>,
            <>Acesso do corretor restrito à própria carteira; acessos administrativos são auditados.</>,
            <>Registro das ações relevantes, com autor, data e efeito.</>,
          ]}
        />
        <p>Nenhum sistema é infalível; em caso de incidente relevante, o controlador e a ANPD serão comunicados na forma da lei.</p>
      </LegalSection>

      <LegalSection id="direitos" title="10. Seus direitos">
        <p>Sob a LGPD (art. 18), o titular pode solicitar a qualquer momento:</p>
        <LegalList
          items={[
            <>confirmação de que tratamos seus dados e acesso a eles;</>,
            <>correção de dados incompletos, inexatos ou desatualizados;</>,
            <>anonimização, bloqueio ou <strong className="text-[color:var(--atlas-text-primary)]">eliminação</strong> de dados desnecessários ou excessivos;</>,
            <>portabilidade a outro fornecedor;</>,
            <>informação sobre com quem compartilhamos;</>,
            <>revogação do consentimento e oposição a tratamento feito com base em legítimo interesse;</>,
            <>revisão humana de decisões automatizadas.</>,
          ]}
        />
        <p>
          Para exercer, escreva para <a className="text-[color:var(--atlas-accent)] underline-offset-4 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          Respondemos nos prazos da lei. Para apagar seus dados, veja também a página de{" "}
          <Link className="text-[color:var(--atlas-accent)] underline-offset-4 hover:underline" href="/data-deletion">exclusão de dados</Link>.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="11. Cookies">
        <p>
          Usamos apenas cookies necessários para manter a sessão autenticada de usuários da plataforma e a segurança do
          acesso. Não usamos cookies de publicidade nem rastreamento de terceiros nestas páginas públicas.
        </p>
      </LegalSection>

      <LegalSection id="internacional" title="12. Transferência internacional">
        <p>
          Alguns operadores processam dados fora do Brasil. Nesses casos, a transferência ocorre com as salvaguardas
          previstas no art. 33 da LGPD, incluindo cláusulas contratuais de proteção equivalentes.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="13. Alterações desta política">
        <p>
          Podemos atualizar este documento para refletir mudanças no produto ou na legislação. A data de última
          atualização fica sempre no topo desta página; mudanças relevantes serão comunicadas ao contratante.
        </p>
      </LegalSection>

      <LegalSection id="contato" title="14. Contato e encarregado">
        <p>
          Dúvidas sobre privacidade, pedidos de titular ou comunicação de incidentes:{" "}
          <a className="text-[color:var(--atlas-accent)] underline-offset-4 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </LegalSection>
    </PublicPageShell>
  );
}

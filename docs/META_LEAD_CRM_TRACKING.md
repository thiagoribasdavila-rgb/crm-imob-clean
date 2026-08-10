# Rastreamento Meta Lead Ads → CRM

## Fluxo protegido

1. A Meta chama `POST /api/webhooks/meta` com assinatura HMAC válida.
2. O Atlas registra o evento e o coloca na fila `meta.lead.fetch`.
3. O worker busca os dados oficiais do lead no Graph API.
4. Antes de criar uma lead, o Atlas procura o mesmo evento Meta e depois a identidade canônica por e-mail e telefone.
5. Se encontrar uma única pessoa, atualiza o registro existente e preserva o corretor, a etapa e o histórico atuais.
6. Se não encontrar, cria uma nova lead com origem e atribuição Meta preservadas.
7. Se e-mail e telefone apontarem para pessoas diferentes, interrompe a automação e envia o evento para revisão, sem mesclar clientes.

## Como comprovar com uma lead real de teste

1. Em **Integrações > Meta**, cadastre a Página e o formulário ativos.
2. Na ferramenta de testes da Meta, crie uma lead de teste do formulário.
3. No Atlas, selecione a fonte, informe o ID dessa lead e use **Executar ensaio real**.
4. Confira a seção **Entrada Meta → atualização no CRM**: o evento deve estar como `IMPORTED` e `CRM atualizado`.
5. Confirme na tela de Leads a origem Meta, campanha e responsável. A distribuição automática só considera a roleta aprovada pela diretoria quando não há responsável padrão na fonte.

## Limites operacionais

- Nenhuma mensagem é enviada ao cliente por este fluxo.
- O envio de conversões permanece sujeito a consentimento e à configuração de teste.
- Sem `META_LEAD_ACCESS_TOKEN`, a fila mantém o evento para nova tentativa e registra a falha sem criar dados parciais.

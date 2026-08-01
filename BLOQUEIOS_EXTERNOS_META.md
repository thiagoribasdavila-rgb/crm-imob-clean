# BLOQUEIOS EXTERNOS — META E WHATSAPP

Data: 2026-07-28. Nenhum item desta lista se resolve com código: cada um foi
medido contra a API real, tem causa confirmada e responsável nomeado. Depois de
QUALQUER mudança aqui descrita, rode `npm run meta:diagnostico` — ele confirma
em segundos, sem enviar evento nenhum e sem imprimir token.

A causa raiz comum, medida por `debug_token`: os tokens que FUNCIONAM
(`META_LEAD_ACCESS_TOKEN`, `META_ADS_ACCESS_TOKEN`) são do System User
**ATLAS INTEGRACOES**, app `2441435319712424`, sem expiração. Os que FALHAM
foram gerados por **outro app**. Regerar tudo do mesmo System User elimina a
família inteira de erros 190/465.

---

## 1. Token do CAPI (dataset de conversões) — trava o ciclo fechado

**Sintoma medido:** `OAuthException 190/465 — "The application does not belong
to system user's business"`. O token é inválido até no `/me`.

**Consequência enquanto durar:** nenhuma venda/visita volta para a Meta; o
anúncio otimiza por clique, não por comprador. A flag
`ATLAS_META_CAPI_ENABLED` deve permanecer DESLIGADA (ligada com token errado,
cada conversão falharia em silêncio — o preflight agora recusa e explica, mas
o estado honesto é desligado).

**Ação exata (Business Manager):**
1. Configurações do negócio → Usuários → **Usuários do sistema** → `ATLAS INTEGRACOES`.
2. Confirmar que o dataset `1099679177…` (variável `META_CAPI_DATASET_ID`) está
   no MESMO Business; se não estiver, atribuí-lo ao System User em
   Fontes de dados → Conjuntos de dados → Atribuir parceiros/pessoas.
3. **Gerar token** pelo próprio System User com escopo `ads_management`
   (o mesmo fluxo que gerou os tokens que funcionam).
4. Substituir `META_CONVERSIONS_ACCESS_TOKEN` no `.env` do servidor. Nunca em
   Git, ZIP ou chat.
5. `npm run meta:diagnostico` → "dataset de conversões ✔". Só então avaliar
   `ATLAS_META_CAPI_ENABLED=true`, começando em modo teste com
   `test_event_code`.

**Quem resolve:** quem administra o Business Manager.

## 2. Conta de anúncios — o CRM aponta para a conta parada

**Sintoma medido:** `act_361228…` responde, mas a campanha mais recente tem
**577 dias**. As campanhas reais de Arvo/Spin rodam em
`act_893242765778454` (**D'Avila – Senna**), onde o token devolve
`403 (#200)` — o System User não está atribuído a ela. E a conta certa está
com **"Limite de gastos atingido"**.

**Ação exata (Business Manager):**
1. Usuários do sistema → `ATLAS INTEGRACOES` → **Adicionar ativos** →
   Contas de anúncio → `D'Avila – Senna` → **Gerenciar campanhas**.
2. Cobrança e pagamentos → elevar/remover o teto de gastos da conta.
3. No `.env` do servidor: `META_AD_ACCOUNT_ID=act_893242765778454`.
4. `npm run meta:diagnostico` → conta com campanhas recentes, sem "suspeita".

**Quem resolve:** quem administra o Business Manager (passos 1–2) e quem
configura o servidor (passo 3).

## 3. Número do WhatsApp — nunca foi verificado

**Sintoma medido:** número `+55 11 99928-6902` (WABA "Diego Dutra", aprovada,
qualidade GREEN) com `code_verification_status: NOT_VERIFIED`,
`status: DISCONNECTED`, `platform_type: ON_PREMISE`, certificado ausente.
Cadastrado não é ativo: sem verificação, não envia nem recebe.

**Consequência enquanto durar:** o CRM bloqueia qualquer envio real pelo
preflight (com o motivo e o responsável na mensagem). A regra de distribuição
"todos conectados no WhatsApp para receber leads" segue não satisfeita — toda
lead nova vai para REPRESADAS e o diretor distribui pelo Command Center.

**Ação exata (WhatsApp Manager + o aparelho do corretor):**
1. WhatsApp Manager → Contas do WhatsApp Business → "Diego Dutra" → o número.
2. **Verificar por código** (SMS ou ligação) — quem resolve é QUEM TEM O
   APARELHO com esse chip, não o administrador.
3. Na ativação, escolher **Cloud API** como plataforma (a atual, on-premise, é
   a legada e não atende os endpoints que o CRM usa).
4. Definir o PIN de duas etapas e guardar.
5. Atenção à escolha: registrar o número na API DESLIGA o WhatsApp comum desse
   número no celular. Se o corretor usa esse número no dia a dia, decidir por
   um número dedicado ANTES de verificar.
6. Criar e submeter ao menos 1 template (hoje: ZERO aprovados) — sem template,
   só é possível responder dentro da janela de 24h de quem escreveu primeiro.
7. `npm run meta:diagnostico` → seção WHATSAPP com "✔ verificado e em Cloud API".

## 4. Apontar os anúncios para os formulários com qualificação

**Estado:** `Spin Mood (v8)` `1571460868037960` e `Arvo (v6)`
`1601751148056662` estão ativos, com as 3 perguntas, consentimento e dono. Os
anúncios ainda apontam para os formulários antigos (só nome/e-mail/telefone) —
enquanto apontarem, toda lead continua entrando sem qualificação.

**Ação exata (Ads Manager):** nos conjuntos de anúncio ativos, trocar o
formulário de destino pelos novos. Depois disso, a primeira lead real valida o
caminho de ponta a ponta (é o item "recebimento de lead" marcado NÃO TESTADO).

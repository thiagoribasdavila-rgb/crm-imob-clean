# TESTE REAL — roteiro de execução

Ambiente: **homologação** (`atlas-v3-homologacao`). Não usa dado de cliente.

## Antes de começar

```bash
cd ~/atlas-v3 && npm run dev
```

Abra `http://localhost:3000`.

> **Não estranhe o `git status` enquanto o servidor roda.** O `dev` põe ~51 rotas legadas em
> quarentena (move para fora da árvore) e o Git as mostra como apagadas. Elas voltam sozinhas
> quando o servidor para — verificado. Não commite nesse estado e não tente "restaurar" nada.

Verificado em 2026-07-24: a app sobe em ~300 ms, `/api/health` responde 200 e `/api/ready`
confirma conexão com o banco em ~1,1 s.

O `.env.local` já aponta para homologação. **Não** troque para o outro projeto: ele tem
17.151 leads reais. Para confirmar a qualquer momento contra qual banco você está:

```bash
npm run database:target:check
```

Esperado em homologação: **APROVADO, 13 de 14 objetos**. Se aparecer REPROVADO, pare —
o ambiente está apontando para o banco legado, que não sustenta a aplicação.

## Quem loga

Existem **6 contas ativas** na organização Atlas One, com a hierarquia completa:

| papel | quantidade | o que essa conta enxerga |
|---|---|---|
| Diretor (admin) | 1 | tudo da organização |
| Gerente | 2 | a própria equipe |
| Corretor | 3 | a própria carteira |

Os três corretores reportam ao mesmo gerente — é isso que permite testar o recorte hierárquico
de verdade: o **outro** gerente não pode enxergar essa carteira.

As senhas são suas; eu não tenho nem devo ter acesso a elas.

## Dados de teste plantados

18 leads sintéticos, todos com nome prefixado por `Teste ·` e e-mail `@exemplo.test`.
Não foram criados para encher tabela — cada grupo aciona um estado que o produto mede:

| grupo | qtd | o que deve acontecer na tela |
|---|---|---|
| SLA de primeiro contato vencido | **4** | bloco "Kanban de execução" em **vermelho** (crítico) |
| Sem próxima ação | **8** | estado de **atenção**, se não houver SLA vencido |
| Quentes (temperatura + score alto) | **9** | estado de **oportunidade** |
| Sem dono | **3** | aparecem na fila de distribuição |
| Funil completo | novo 6 · contato 1 · qualificação 2 · visita 2 · proposta 2 · contrato 1 | Kanban com todas as colunas povoadas |
| Fechados | ganho 2 · perdido 2 | conversão e motivo de descarte deixam de ficar zerados |

## Roteiro — na ordem, 30 a 45 minutos

### 1. Login e shell (5 min)
- [ ] Entrar como **corretor**. O nome no topo deve aparecer (o servidor deriva do e-mail
      quando o cadastro não tem nome preenchido — 5 dos 6 perfis estão assim).
- [ ] Conferir que a navegação lateral mostra **só** o que o papel permite.
- [ ] Sair e entrar como **gerente**: a navegação deve crescer.
- [ ] Entrar como **diretor**: deve ver o máximo.

### 2. Pipeline — o coração do teste (10 min)
- [ ] Abrir `/pipeline`. O bloco **"Kanban de execução"** deve aparecer no topo.
- [ ] **Esperado: estado crítico (vermelho)** — há 4 leads com SLA vencido.
- [ ] Conferir os 4 números do bloco: SLA, Sem ação, Quentes, Visíveis.
- [ ] Arrastar um lead de coluna. Deve aparecer a confirmação e o botão **Desfazer**.
- [ ] Clicar em Desfazer e conferir que o lead volta.
- [ ] Alternar o **modo foco** e conferir que a tela simplifica.

### 3. Tema claro (5 min) — a parte mais nova e menos testada
- [ ] Alternar para o tema claro pelo botão na barra superior.
- [ ] `/pipeline`: título, subtítulo, cards, colunas e o bloco de execução devem ficar legíveis.
- [ ] Textos em **negrito** devem estar escuros e nítidos (medido em 18,72:1, AAA).
- [ ] Voltar ao escuro e conferir que nada mudou de lugar.
- [ ] **Atenção — limite conhecido:** o tema claro cobre hoje páginas públicas, shell interno
      e pipeline. Command Center, Leads, Projetos e Copilot **ainda não foram convertidos** e
      vão parecer inconsistentes. Isso é esperado, não é regressão.

### 4. Leads (10 min)
- [ ] Abrir `/leads`, buscar por `Teste ·`.
- [ ] Abrir um lead e conferir a timeline.
- [ ] Como **gerente**, abrir `/distribution`: os 3 leads sem dono devem aparecer na fila.
- [ ] Atribuir um deles a um corretor e conferir que sai da fila.

### 5. As 8 telas que estavam quebradas (5 min)
Estas tinham TypeError garantido e foram corrigidas no commit `e897adfe`. Basta abrir e
confirmar que **carregam sem tela branca**:
- [ ] `/developments/registry` · `/developments/homologation`
- [ ] `/leads/deduplication`
- [ ] em um lead: `/behavior`, `/contact-preferences`, `/attribution`
- [ ] em um empreendimento: `/dossier`, `/region-study`

### 6. Tarefas recorrentes (5 min) — funcionalidade nova
- [ ] Em `/tasks`, criar uma tarefa com **cadência** (diária/semanal/mensal), data final e
      limite de ocorrências. Deve criar a série, não mais recusar com "liberada após homologação".
- [ ] Tentar criar sem data final **e** sem limite: deve recusar — série infinita não é criada.
- [ ] Tentar 1 ocorrência ou 200: deve recusar (o aceito é 2 a 100).
- [ ] Abrir **Recorrências ativas** e clicar em **Encerrar repetição**.
- [ ] Confirmar que as tarefas já criadas **continuam existindo** — encerrar para a geração
      de novas, não apaga histórico.

### 7. Governança da distribuição (5 min) — funcionalidade nova
Como **gerente** ou **diretor**, em `/distribution`:
- [ ] **Cobertura por ausência**: escolher um corretor, período futuro e motivo. Sem motivo
      de 10+ caracteres deve recusar — a decisão fica auditável com a razão.
- [ ] **Limite de carteira**: ajustar o teto de um corretor com motivo. Fora de 1–500 recusa.
- [ ] **Prioridade da fila**: definir prioridade por origem com motivo. Fora de 1–100 recusa.
- [ ] Distribuir leads e conferir que a resposta indica o motor governado
      (`priorityHonoured: true`) — é ele que respeita prioridade e limite de carteira.

### 8. Mobile (5 min)
- [ ] Reduzir a janela para largura de celular.
- [ ] `/pipeline`: o bloco de execução deve virar 1 coluna e os sinais, 2 colunas.

## O que NÃO funciona hoje — não reporte como bug

| item | por quê |
|---|---|
| ~~Recorrência de tarefas~~ | **Passou a funcionar.** Criar série com cadência, fim e limite, e encerrar pelo botão "Encerrar repetição" em Tarefas → Recorrências ativas. Teste isso. |
| SLA de follow-up com números | a tabela existe e está vazia; exibir seria mostrar zero como se fosse medição |
| `/leads/actions` | é um stub com 4 botões inertes — decisão de produto pendente (D-5) |
| Favicon sem órbita/planeta | simplificação deliberada (D-7) |
| Tema claro fora de pipeline/públicas | ainda não convertido |

## Ao terminar

Para apagar os dados de teste sem tocar em mais nada:

```sql
delete from public.leads
where organization_id = '7c8c71c1-e963-464c-be5c-ff8c7936f51a'
  and metadata->>'seed' = 'homologacao-teste-real';
```

O seed é idempotente: rodar `supabase/seeds/homologacao-teste-real.sql` de novo limpa e recria.

## Reporte assim

Para cada problema: **tela · papel de quem estava logado · o que você fez · o que esperava ·
o que aconteceu**. Se a tela ficou branca, o console do navegador (F12) costuma ter a linha
exata — cole junto.

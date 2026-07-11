# Atlas AI — Arquitetura V1, V2 e V3

## V1 — Operação comercial

- autenticação e usuários;
- empresas e permissões;
- leads, clientes e histórico;
- pipeline, tarefas e agenda;
- imóveis, empreendimentos e unidades;
- propostas, reservas, vendas e comissões;
- dashboard e relatórios;
- integrações básicas.

## V2 — Inteligência e automação

- lead scoring;
- recomendação de próxima ação;
- atendimento e follow-up assistidos;
- automações e webhooks;
- Andromeda Marketing Intelligence;
- atribuição, CPL, CAC e ROI;
- copilots para corretor, gestor, investidor e incorporadora;
- agentes com aprovação humana.

## V3 — Real Estate Operating System

- Digital Twin de comprador, imóvel, empreendimento, região e mercado;
- memória operacional e inteligência coletiva;
- motor preditivo e simulação;
- marketplace inteligente;
- agentes autônomos governados;
- arquitetura multiempresa e extensível;
- governança, auditoria e segurança de IA.

## Camadas canônicas

```text
app/                 experiência e rotas
components/          interface reutilizável
application/         casos de uso
core/                motores e inteligência
 domain/             entidades e regras de negócio
lib/                  adaptadores e infraestrutura
prisma/               modelo relacional
```

A reorganização será incremental para preservar o código existente e evitar exclusões prematuras.

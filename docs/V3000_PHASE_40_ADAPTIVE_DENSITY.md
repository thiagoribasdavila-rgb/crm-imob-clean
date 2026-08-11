# V3000 — Fase 40: densidade adaptativa por tela e papel

## Resultado

O card decisório canônico agora usa a mesma árvore de dados em três leituras:

- **execução:** corretor vê a próxima ação com menos espaçamento;
- **exceções:** gerente e superintendente veem urgência primeiro;
- **executiva:** diretor e administração veem evidência e impacto primeiro.

O shell resolve o perfil com o contexto de autenticação já carregado. Não existe
consulta adicional, regra comercial paralela ou versão duplicada do componente.

## Dispositivos

- desktop preserva a alternância confortável/compacta já existente;
- tablet preserva o workspace adaptativo;
- mobile usa uma coluna e mantém a ação primária em largura total.

## Superfícies adotadas

- Sala de Comando (`/dashboard`);
- Leads (`/leads`);
- Pipeline (`/pipeline`).

## Proteções

- nenhuma mudança de banco ou API;
- nenhuma duplicação de regra por papel;
- ação primária nunca é escondida;
- primitiva permanece server-safe;
- contexto detalhado continua sob demanda, conforme a Fase 39.

## Verificação

```bash
npm run v3000:phase-40:check
npm run v3000:phase-40:test
```

# ATLAS AI OS — Fase 20/100

## Ensaio manual governado no Meta Test Events

### Resultado

O Atlas agora consegue preparar um pacote de autorização temporário para um único evento sintético na superfície oficial de testes da Meta. O sistema não transmite eventos, não lê credenciais e não guarda o código temporário, o payload ou a resposta oficial.

O pacote real não foi gerado porque ainda faltam as evidências aprovadas das Fases 17 e 19, além dos aceites explícitos da diretoria e da revisão de segurança.

### O que o pacote comprova

- branch Supabase isolado, tenant e RLS aprovados na Fase 17;
- comparação local, privacidade e verdade comercial aprovadas na Fase 19;
- aprovação distinta de diretoria e segurança;
- janela de autorização com duração máxima de 24 horas;
- uso exclusivo de registro sintético;
- exatamente um evento canônico e uma tentativa;
- proibição de produção e de alterações em campanha, orçamento ou público;
- ausência de alegação de `Event Match Quality` ou impacto de otimização.

### Fluxo do operador

1. Obter as evidências aprovadas das Fases 17 e 19.
2. Registrar os aceites de diretoria e segurança, sem nome, e-mail ou credencial no arquivo.
3. Gerar o pacote sanitizado da Fase 20.
4. Abrir manualmente a área oficial de Test Events.
5. Consultar e usar o código temporário somente dentro das ferramentas oficiais da Meta.
6. Limitar o ensaio a um evento sintético e não repetir automaticamente em caso de resultado inesperado.
7. Na fase seguinte, registrar apenas presença, horário, tipo de evento e resultado sanitizado.

### O que nunca é armazenado

- token de acesso;
- código temporário de teste;
- e-mail, telefone, CPF, endereço ou renda;
- payload completo ou identificadores hasheados;
- resposta bruta da Meta;
- identificador do projeto Supabase;
- URL privada de banco.

### Segurança do Supabase

O ensaio não cria nem altera tabela. Quando o registro definitivo de auditoria for proposto, acesso pela Data API deverá combinar `GRANT` explícito mínimo com RLS por organização. Um `GRANT` permite alcançar o objeto; a RLS decide quais linhas o usuário pode acessar.

### Estado da fase

- contrato do ensaio manual: **aprovado**;
- autotestes sintéticos: **aprovados**;
- evidência real da Fase 17: **pendente**;
- evidência real da Fase 19: **pendente**;
- aprovação da diretoria: **pendente**;
- aprovação de segurança: **pendente**;
- pacote operacional real: **bloqueado**;
- evento oficial de teste: **não executado**;
- transmissão automática: **inexistente**;
- produção: **bloqueada**;
- build: **não executado**.

### Referências atuais

- Meta, [About Conversions API](https://www.facebook.com/business/help/AboutConversionsAPI).
- Meta for Developers, [Using the Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api/).
- Supabase, [Securing your API](https://supabase.com/docs/guides/api/securing-your-api).
- Supabase, [Tables not exposed to Data and GraphQL API automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

### Próxima fase

A Fase 21 preparará o contrato do recibo sanitizado da observação oficial. Ela não executará o ensaio e não aceitará resposta bruta ou alegação de performance.

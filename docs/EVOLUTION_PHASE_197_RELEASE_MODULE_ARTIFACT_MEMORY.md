# Fase 197 — Memória verificável dos artefatos por módulo

## Objetivo

Impedir que um futuro ZIP use arquivos diferentes daqueles que foram efetivamente validados quando o módulo entrou na memória de conclusão.

## Proteção adicionada

- reúne todos os caminhos de fonte e evidência registrados na revisão do módulo;
- recusa caminho absoluto, fuga da raiz, link simbólico e arquivo não regular;
- calcula SHA-256 e tamanho de cada arquivo;
- agrega o inventário em `artifactSetHash`;
- vincula o snapshot ao `moduleId`, à revisão e ao `entryHash` da memória de conclusão;
- protege o snapshot e a memória inteira com hashes canônicos próprios;
- revalida os bytes atuais do workspace antes de considerar o snapshot íntegro.

Assim, alterar um único byte de código, teste, configuração ou documento já registrado faz a inspeção falhar. A revisão precisa então ser validada e registrada novamente, em vez de reutilizar silenciosamente uma aprovação antiga.

## Primeiro snapshot

O módulo `conversion-core-capture-governance`, revisão 1, possui:

- 48 artefatos;
- 299.795 bytes verificados;
- hash agregado `0a7efb960edb94bf178138d9802e95b0063941f463c84515cad4307148b2a075`.

Esse snapshot prova integridade local. Ele não promove o módulo ao ZIP: runtime, build limpo, rollback e aprovação da diretoria continuam pendentes.

## Fontes canônicas

- conclusão lógica: `config/release-module-completion-memory.json`;
- conteúdo físico: `config/release-module-artifact-memory.json`.

## Efeitos desta fase

Nenhum acesso remoto, alteração de banco, migration, build, ZIP ou deploy foi executado.

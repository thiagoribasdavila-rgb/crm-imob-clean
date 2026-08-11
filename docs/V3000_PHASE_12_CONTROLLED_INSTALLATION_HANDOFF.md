# Atlas One V3000 — Fase 12: instalação controlada

## Resultado

A Fase 12 fecha o caminho entre o ZIP comprovado na Fase 10 e a homologação autenticada da Fase 11. Ela não recompila, não publica, não executa migration e não altera o Supabase.

O artefato aceito permanece exatamente:

- `atlas-one-v3000-phase-10-proven.zip`;
- SHA-256 `80170576910f3681b50a5a5a43bd24ce0cc29153b9a8d7b22235d9f701336715`;
- 7.424.217 bytes;
- 3.564 entradas registradas na prova;
- fingerprint de origem `sha256:8cff80d9cde28c4bf0cf078a4b5e47a8acd4d3a35961fdde162db7c349450aa6`.

## O que o gate prova

Antes da instalação, o verificador confirma:

1. identidade do ZIP por nome, tamanho e SHA-256 calculado;
2. paridade com o checksum externo e a prova do build limpo;
3. presença dos arquivos mínimos de execução na Hostinger;
4. Node `>=22`, Node 24 recomendado, `npm run build` e `npm start`;
5. presença somente dos **nomes** das variáveis mínimas no modelo seguro;
6. ausência de `.env`, `.env.local`, chaves privadas e credenciais no pacote;
7. bootstrap desativado porque o administrador existente deve ser preservado;
8. zero migration, zero mutação de banco e zero publicação nesta fase.

Sem a evidência real da Fase 11, o resultado permanece `pending-authorized-deployment` e a promoção do template continua bloqueada.

## Comando de pré-instalação

```bash
npm run v3000:phase-12:check -- \
  --zip=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip \
  --checksum=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.proof.json
```

O resultado esperado antes do deploy é:

- `installationReady: true`;
- `handoffStatus: ready-for-authorized-installation`;
- `productionStatus: pending-authorized-deployment`;
- `eligibleForTemplatePromotion: false`;
- `deploymentPerformed: false`.

## Instalação autorizada na Hostinger

1. mantenha a versão funcional atual disponível para rollback;
2. envie somente o ZIP cujo SHA-256 foi aprovado pelo gate;
3. use uma pasta de release vazia;
4. configure Node 24;
5. execute `npm ci --omit=dev=false`;
6. configure as variáveis reais exclusivamente no painel/ambiente da Hostinger;
7. mantenha `ATLAS_BOOTSTRAP_SECRET` ausente;
8. execute `npm run prisma:generate`, `npm run build` e `npm start`;
9. não execute migrations nesta passagem;
10. execute a homologação autenticada descrita na Fase 11.

## Retorno seguro

Se a aplicação não iniciar ou a rota autenticada falhar:

1. interrompa a nova release;
2. restaure a release anterior da aplicação;
3. preserve o mesmo ambiente Supabase;
4. não reverta dados, pois esta fase não autoriza migrations nem mutações;
5. registre a falha sem copiar valores de variáveis ou credenciais.

## Fechamento pós-deploy

Depois da instalação autorizada e da coleta da evidência da Fase 11:

```bash
npm run v3000:phase-12:check -- \
  --zip=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip \
  --checksum=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof=/Users/thiagoribasdavila/Downloads/atlas-one-v3000-phase-10-proven.zip.proof.json \
  --evidence=/caminho/seguro/evidencia-fase-11.json
```

Somente a evidência completa muda o estado para `post-deploy-approved`.

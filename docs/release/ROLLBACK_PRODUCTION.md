# ROLLBACK DE PRODUÇÃO

**Cenário:** Hostinger Node.js App gerenciada. O rollback é **reimplantar o ZIP
anterior pelo hPanel** — foi exatamente o que foi feito em 31/07 para
restabelecer o serviço.

## O ARTEFATO DE ROLLBACK — preservado e conferido

| campo | valor |
|---|---|
| arquivo | `atlas-v3-completo-2026-07-30.zip` |
| local | `~/Downloads/` |
| SHA-256 | `58eb23d25d6376513aa53f608b0b485f364cf167be6c8d9280593a6f61a4f0a3` |
| tamanho | 6.240.058 bytes |
| CRC | **OK** |

**É o pacote em operação agora.** Não foi substituído nem alterado por esta
entrega.

```bash
shasum -a 256 ~/Downloads/atlas-v3-completo-2026-07-30.zip
```

## POR QUE O ROLLBACK AQUI É SEGURO

**O deploy não toca no banco.** Verificado:

- a Hostinger executa só `npm ci → npm run build → npm start`;
- `scripts/build.mjs` lê nomes de arquivo em `supabase/migrations` — **nenhuma
  conexão**;
- **nenhum** hook `preinstall`/`postinstall`/`prebuild`/`poststart`;
- o único script que cita `reset` não está em nenhum dos três comandos;
- **nenhuma migration pendente** — as 4 desta linha já foram aplicadas, drift 0.

> **Consequência:** voltar a versão anterior **não** deixa o banco num estado
> incompatível. É o que torna este rollback trivial — e o que deixaria de ser
> verdade num deploy com migration pendente.

## O PROCEDIMENTO

**1. Decida rápido.** Se a validação pós-deploy falhou nos itens 3 ou 5
(login quebrado, ou segredo no HTML), **role de volta antes de investigar**. O
diagnóstico pode esperar; o usuário sem sistema, não.

**2. Reimplante pelo hPanel.**
hPanel → aplicação Node.js → histórico de implantações → selecione
`atlas-v3-completo-2026-07-30.zip` → reimplantar. Ou faça upload do arquivo de
`~/Downloads/`.

**3. Confira as variáveis.** O rollback **não** desfaz mudanças de variável. Se
você alterou alguma para o deploy novo, a versão antiga pode não gostar.

**4. Reconstrua.** Mesmo no rollback: `NEXT_PUBLIC_*` é assada no bundle.

**5. Prove que voltou.**

```bash
bash scripts/production/smoke-test.sh https://atlasaios.com.br
curl -s https://atlasaios.com.br/api/v1/ready | head -c 200
```

E **abra `/login`**: precisa ter campo de senha.

> **Rollback sem verificação é trocar um estado desconhecido por outro.**

**6. Purgue o cache do CDN** se a página velha insistir.

## SE O ROLLBACK TAMBÉM FALHAR

Pare de trocar pacote. Duas trocas seguidas sem sucesso significam que o problema
**não está no artefato** — está nas variáveis ou na configuração da aplicação.

```bash
curl -s https://atlasaios.com.br/api/v1/ready
```

Se disser `banco_fora`, a resposta **lista as variáveis ausentes**. Comece por aí.

## O QUE O ROLLBACK NÃO RESOLVE

| não resolve | por quê |
|---|---|
| variáveis erradas ou ausentes | acompanham a aplicação, não o pacote |
| cache do CDN | precisa de purge explícito |
| dado já gravado | nenhum deploy desta linha grava dado de usuário |
| fila parada | depende do agendador externo, não do pacote |

## REGISTRO

Guarde, para cada troca: horário UTC, pacote que saiu, pacote que entrou, motivo,
e o resultado do smoke **depois**. Sem esse registro, a terceira troca acontece
sem ninguém lembrar o que a segunda mudou.

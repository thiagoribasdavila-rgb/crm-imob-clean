# Fase 66 — Versionamento e vigência comercial

## Resultado

Tabela de preços, espelho de vendas e condição de pagamento formam um pacote comercial versionado. Apenas um pacote pode permanecer ativo por empreendimento, com início, término e aprovação da diretoria.

## Proteções

- Superintendência pode preparar rascunho; somente diretoria ativa com motivo.
- Fontes são validadas no mesmo tenant, empreendimento e incorporadora.
- Ativação substitui a versão anterior atomicamente e alinha materiais e regra ativa.
- Simulação exige pacote vigente e salva ID, versão, fontes e validade no snapshot.
- O vencimento do pacote limita automaticamente a validade da simulação.

## Homologação externa

Aplicar migration 66 e validar duas versões, ativação concorrente, fontes cruzadas, vigência futura/expirada, substituição, simulação, proposta histórica, diretoria, superintendência e dois tenants.

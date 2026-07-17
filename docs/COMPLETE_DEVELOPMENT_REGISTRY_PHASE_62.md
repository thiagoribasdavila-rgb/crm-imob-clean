# Fase 62 — Cadastro completo de empreendimentos

## Resultado

Cada projeto passa a ter uma ficha operacional única, vinculada por ID à incorporadora canônica. A ficha reúne identidade, localização, geolocalização, segmento, produto, tipologias, faixas de dormitórios, área e preço, volume de unidades, datas e ciclo comercial.

## Governança

- Diretoria e superintendência são os únicos perfis que gravam pela operação atômica `upsert_complete_development`.
- A incorporadora precisa pertencer à mesma organização e estar ativa ou em onboarding.
- Faixas, coordenadas e datas são validadas no banco; código e slug são únicos por organização.
- O nome legado da incorporadora é sincronizado para manter consumidores atuais enquanto o vínculo por ID assume a fonte da verdade.
- Alterações geram eventos sem expor dados sensíveis e a leitura continua isolada por tenant.

## Homologação externa

Aplicar as migrations 61 e 62 em ordem e validar: dois tenants, dois níveis de liderança, incorporadora inválida, códigos repetidos, limites de faixas, datas, geolocalização, edição concorrente e criação automática do dossiê de inteligência.

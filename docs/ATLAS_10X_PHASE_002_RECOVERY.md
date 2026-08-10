# ATLAS AI OS — Fase 2/24

## Backup, restauração e rollback comprovados

### Objetivo

Eliminar o plano obsoleto de retorno ao V2 e preparar uma recuperação real do
Atlas V3 usando três ativos independentes:

1. restauração isolada do banco;
2. recuperação dos arquivos do Storage;
3. pacote imutável da versão anterior do V3.

### Problema corrigido

O módulo de auditoria ainda apresentava o V2 como destino de rollback. Esse
ambiente já foi removido da Hostinger, portanto um ensaio antigo poderia
qualificar o aceite executivo mesmo sem existir um destino recuperável.

O aceite agora considera somente registros identificados como rollback entre
versões do V3. Registros históricos continuam preservados, mas não liberam
produção.

### Regra de recuperação

- O backup do banco não inclui os objetos do Storage; os arquivos precisam de
  inventário e evidência próprios.
- A versão anterior deve possuir pacote imutável com referência verificável,
  preferencialmente ZIP e SHA-256.
- A URL de recuperação deve usar HTTPS e ser diferente da versão atual.
- Um ensaio aprovado exige resposta HTTP entre 200 e 399.
- A interface exige banco restaurado, arquivos, pacote, duração e evidência.
- A automação não executa restauração automaticamente e não muda tráfego.
- A diretoria continua responsável pela decisão final.

### Compatibilidade sem migração destrutiva

A tabela histórica `v2_rollback_drills` permanece intacta para preservar
registros e evitar mudança remota nesta fase. Os novos ensaios recebem um
marcador inequívoco de rollback V3 no campo de observações. A API e o aceite
executivo filtram esse marcador, impedindo que um ensaio legado seja contado.

Uma migration canônica para renomear a estrutura poderá ser preparada somente
depois da auditoria do schema remoto e de uma janela com backup aprovado.

### Validação real ainda necessária

Antes de liberar produção:

- restaurar um snapshot em ambiente isolado;
- conferir contagens, constraints, RLS e usuários;
- recuperar e comparar os arquivos do Storage;
- publicar a versão anterior em URL de ensaio;
- validar login, leads, pipeline, agenda e integrações;
- medir o tempo total;
- anexar evidências na área de auditoria;
- obter aprovação humana.

### Política de entrega

Nenhum build ou ZIP é criado nesta fase. Eles continuam reservados ao
fechamento do pacote de release.

### Próxima fase

Fase 3/24 — Paridade de ambientes e schema remoto.

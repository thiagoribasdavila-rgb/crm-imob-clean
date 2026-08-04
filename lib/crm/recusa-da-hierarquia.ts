/**
 * AS RECUSAS DA HIERARQUIA, TRADUZIDAS — seis causas, seis frases.
 *
 * ── O defeito que este módulo corrige ─────────────────────────────────────
 *
 * `PATCH /api/v1/team` mapeava QUALQUER erro da RPC `manage_commercial_profile`
 * para uma frase só: "A hierarquia comercial recusou esta alteração: confira o
 * responsável direto escolhido." Medido em 03/08/2026: o gatilho
 * `private.validate_commercial_hierarchy` levanta SEIS exceções diferentes, e em
 * quatro delas o responsável direto não tem nada a ver com o problema. Quem lia
 * ia conferir o campo errado.
 *
 * ── A assimetria que ninguém tinha notado ─────────────────────────────────
 *
 * O gatilho começa com `if not new.active then return new`. Ou seja:
 * DESATIVAR nunca valida nada, e ATIVAR valida a cadeia RBAC inteira. Um
 * corretor pode ser desligado a qualquer momento e depois ficar preso fora do
 * sistema se, nesse meio-tempo, o supervisor dele foi desativado ou trocou de
 * papel. O botão parece simétrico e não é.
 *
 * Por isso cada recusa diz também O QUE FAZER — sem isso a pessoa fica olhando
 * para um botão que não funciona, sem saber que o conserto está em outro perfil.
 */

export type RecusaTraduzida = {
  codigo: string;
  mensagem: string;
  /** O campo que a pessoa precisa mexer. `null` quando o conserto é em OUTRO perfil. */
  campo: "reportsTo" | "commercialRole" | "accessRole" | null;
};

/**
 * As exceções do gatilho, na ordem em que ele as levanta.
 *
 * As chaves são o texto exato do `raise exception` — casar por substring, e não
 * por igualdade, porque o PostgREST embrulha a mensagem com contexto.
 */
const RECUSAS: Array<{ marca: string; recusa: RecusaTraduzida }> = [
  {
    marca: "rbac_role_required",
    recusa: {
      codigo: "PAPEL_AUSENTE",
      mensagem: "Este perfil está sem papel comercial ou sem papel de acesso. Defina os dois antes de ativar.",
      campo: "commercialRole",
    },
  },
  {
    marca: "executive_role_requires_root_scope",
    recusa: {
      codigo: "EXECUTIVO_COM_SUPERVISOR",
      mensagem:
        "Admin e diretor decisor são topo da hierarquia: precisam ter papel comercial de diretor e NENHUM responsável direto. Remova o responsável.",
      campo: "reportsTo",
    },
  },
  {
    marca: "valid_supervisor_required",
    recusa: {
      codigo: "SEM_RESPONSAVEL",
      mensagem: "Escolha um responsável direto. Só admin e diretor decisor podem ficar sem — e um perfil não pode responder a si mesmo.",
      campo: "reportsTo",
    },
  },
  {
    marca: "supervisor_outside_organization_or_inactive",
    recusa: {
      codigo: "RESPONSAVEL_INATIVO",
      mensagem:
        "O responsável direto deste perfil está INATIVO (ou é de outra organização). Reative o responsável primeiro — a hierarquia só aceita cadeia viva. É a armadilha comum: desligar um gestor prende a equipe dele fora do sistema.",
      campo: null,
    },
  },
  {
    marca: "operational_director_requires_decision_director",
    recusa: {
      codigo: "DIRETOR_OPERACIONAL_SEM_DECISOR",
      mensagem:
        "Um diretor operacional precisa ter papel comercial de gerente e responder a um diretor decisor. Ajuste o papel ou o responsável.",
      campo: "reportsTo",
    },
  },
  {
    marca: "broker_requires_operational_director",
    recusa: {
      codigo: "CORRETOR_SEM_DIRETOR",
      mensagem:
        "Corretor precisa responder a um diretor operacional (perfil com acesso de diretor). O responsável escolhido não é um — escolha outro.",
      campo: "reportsTo",
    },
  },
  {
    marca: "invalid_access_role",
    recusa: {
      codigo: "ACESSO_INVALIDO",
      mensagem: "O papel de acesso deste perfil não é reconhecido pela hierarquia.",
      campo: "accessRole",
    },
  },
  {
    marca: "hierarchy_management_forbidden",
    recusa: {
      codigo: "FORA_DO_SEU_ESCOPO",
      mensagem: "Este perfil está fora da sua linha hierárquica — você administra apenas quem responde a você.",
      campo: null,
    },
  },
  {
    marca: "supervisor_outside_actor_hierarchy",
    recusa: {
      codigo: "RESPONSAVEL_FORA_DA_SUA_LINHA",
      mensagem: "O responsável direto escolhido está fora da sua linha hierárquica. Estrutura paralela não é permitida.",
      campo: "reportsTo",
    },
  },
  {
    marca: "cannot_deactivate_self",
    recusa: {
      codigo: "AUTODESATIVACAO",
      mensagem: "Você não pode desativar o próprio acesso.",
      campo: null,
    },
  },
  {
    marca: "profile_not_found",
    recusa: {
      codigo: "PERFIL_NAO_ENCONTRADO",
      mensagem: "Perfil não encontrado nesta organização, ou quem está executando a ação não está ativo.",
      campo: null,
    },
  },
];

/**
 * Traduz o erro cru do banco. Devolve `null` quando a mensagem não é nenhuma das
 * recusas conhecidas — e nesse caso quem chama deve mostrar o erro ORIGINAL, não
 * um genérico: inventar uma explicação para um erro desconhecido é como esta
 * rota chegou a culpar o responsável direto por tudo.
 */
export function traduzirRecusaDaHierarquia(mensagemCrua: unknown): RecusaTraduzida | null {
  const texto = String(mensagemCrua ?? "").toLowerCase();
  if (!texto) return null;
  for (const { marca, recusa } of RECUSAS) {
    if (texto.includes(marca)) return recusa;
  }
  return null;
}

/**
 * ATIVAR e DESATIVAR não são simétricos, e a tela precisa saber disso.
 *
 * Desativar sempre passa (o gatilho retorna antes de validar). Ativar exige a
 * cadeia inteira. Uma tela que mostra o mesmo botão nos dois sentidos promete
 * uma reversibilidade que o banco não garante.
 */
export function ativarExigeHierarquiaValida(paraAtivo: boolean): boolean {
  return paraAtivo === true;
}

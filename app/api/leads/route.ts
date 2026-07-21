// Compatibilidade temporária: preserva clientes antigos sem manter uma segunda
// implementação ou uma base em memória. O endpoint canônico aplica sessão,
// organização, papel, validação, rate limit e RLS.
//
// Re-exporta SOMENTE o que o endpoint canônico realmente expõe. O shim reexportava
// um `GET` que nunca existiu em @/app/api/v1/leads/route — erro latente que só não
// aparecia porque esta rota é legada e fica quarentenada no dev e no build.
export { POST } from "@/app/api/v1/leads/route";

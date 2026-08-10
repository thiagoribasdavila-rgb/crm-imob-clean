// Compatibilidade temporária: preserva clientes antigos sem manter uma segunda
// implementação ou uma base em memória. O endpoint canônico aplica sessão,
// organização, papel, validação, rate limit e RLS.
export { GET, POST } from "@/app/api/v1/leads/route";

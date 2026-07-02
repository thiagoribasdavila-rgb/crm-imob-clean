export type Lead = {
  id: string
  name: string
  status: "novo" | "contato" | "proposta" | "fechado"
  created_at: string
}

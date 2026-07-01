export type Lead = {
  id: string
  name: string
  email?: string
  phone?: string
  status: "novo" | "contato" | "qualificado" | "fechado"
  created_at: string
}

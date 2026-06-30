export type Lead = {
  id: number;
  name: string;
  email: string;
  status: "Novo" | "Contato" | "Negociando" | "Ganho" | "Perdido";
  source: string;
  createdAt: string;
};

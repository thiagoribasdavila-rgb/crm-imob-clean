import { NextResponse } from "next/server";

export async function GET() {
  const leads = [
    {
      id: 1,
      name: "João Silva",
      email: "joao@email.com",
      status: "Novo",
      source: "Meta Ads",
      createdAt: "2026-06-29",
    },
    {
      id: 2,
      name: "Maria Souza",
      email: "maria@email.com",
      status: "Contato",
      source: "Google Ads",
      createdAt: "2026-06-28",
    },
  ];

  return NextResponse.json(leads);
}

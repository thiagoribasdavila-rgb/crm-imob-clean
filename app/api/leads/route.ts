let leads: any[] = [];

export async function GET() {
  return Response.json(leads);
}

export async function POST(req: Request) {
  const body = await req.json();

  const newLead = {
    id: Date.now(),
    ...body,
  };

  leads.push(newLead);

  return Response.json(newLead);
}

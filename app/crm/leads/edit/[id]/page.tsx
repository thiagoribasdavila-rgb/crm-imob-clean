import LeadEditClient from "./LeadEditClient"

export default function Page({ params }: { params: { id: string } }) {
  return <LeadEditClient id={params.id} />
}

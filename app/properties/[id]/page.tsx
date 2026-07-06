export default async function PropertyDetail({ params }: any) {
  const res = await fetch(`http://localhost:3000/api/properties/${params.id}`);
  const property = await res.json();

  return (
    <div style={{ padding: 24 }}>
      <h1>{property.title}</h1>

      <p>Preço: {property.price}</p>
      <p>Localização: {property.location}</p>
    </div>
  );
}

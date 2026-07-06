export default function PropertyCard({ property }: any) {
  return (
    <div style={{ border: "1px solid #ccc", padding: 10 }}>
      <h3>{property.title}</h3>
      <p>{property.price}</p>
    </div>
  );
}

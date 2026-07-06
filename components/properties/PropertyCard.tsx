type Property = {
  id: string;
  title: string;
  price: string;
  location: string;
  status?: string;
};

export default function PropertyCard({ property }: { property: Property }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        background: "#fff",
      }}
    >
      <h3 style={{ marginBottom: 6 }}>{property.title}</h3>

      <p style={{ margin: 0 }}>📍 {property.location}</p>
      <p style={{ margin: 0 }}>💰 {property.price}</p>

      {property.status && (
        <span
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 8,
            background: "#f2f2f2",
          }}
        >
          {property.status}
        </span>
      )}
    </div>
  );
}

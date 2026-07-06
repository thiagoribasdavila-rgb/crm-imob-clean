"use client";

export default function PropertyMap({
  location,
}: {
  location?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        height: 200,
      }}
    >
      <h4>Mapa do Imóvel</h4>

      <p style={{ fontSize: 13, color: "#666" }}>
        📍 {location || "Localização não informada"}
      </p>

      <div
        style={{
          marginTop: 10,
          height: 120,
          background: "#f5f5f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
        }}
      >
        MAPA (integração futura Google Maps)
      </div>
    </div>
  );
}

import Link from "next/link";

export default function PropertiesPage() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>Imóveis</h1>

        <Link href="/properties/new">
          <button>Novo Imóvel</button>
        </Link>
      </div>

      <p>Catálogo de propriedades disponíveis</p>
    </div>
  );
}

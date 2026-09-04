import Link from "next/link";

export function MigasDePan({ pasos }: { pasos: Array<{ texto: string; href?: string }> }) {
  return (
    <nav aria-label="Ubicación" className="flex flex-wrap items-center gap-1.5 text-sm">
      {pasos.map((p, i) => (
        <span key={p.texto} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-texto-tenue">›</span>}
          {p.href === undefined ? (
            <span className="text-texto">{p.texto}</span>
          ) : (
            <Link href={p.href} className="text-texto-suave hover:text-texto hover:underline">
              {p.texto}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

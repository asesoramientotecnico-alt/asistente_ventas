import Link from "next/link";

export function MigasDePan({ pasos }: { pasos: Array<{ texto: string; href?: string }> }) {
  return (
    <nav aria-label="Ubicación" className="text-sm text-slate-600">
      {pasos.map((p, i) => (
        <span key={p.texto}>
          {i > 0 && <span className="mx-1.5 text-slate-400">/</span>}
          {p.href === undefined ? (
            <span className="text-slate-900">{p.texto}</span>
          ) : (
            <Link href={p.href} className="hover:underline">
              {p.texto}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

import { describe, expect, it } from "vitest";
import { esRutaPublica, puedeVer, rolAlcanza, rolRequerido } from "./acceso.ts";

describe("esRutaPublica", () => {
  it("deja pasar login y el callback de auth", () => {
    expect(esRutaPublica("/login")).toBe(true);
    expect(esRutaPublica("/auth/callback")).toBe(true);
    expect(esRutaPublica("/auth/salir")).toBe(true);
  });

  it("no deja pasar el resto", () => {
    expect(esRutaPublica("/")).toBe(false);
    expect(esRutaPublica("/producto")).toBe(false);
    expect(esRutaPublica("/carrito")).toBe(false);
    expect(esRutaPublica("/admin")).toBe(false);
  });

  it("no confunde una ruta que empieza igual", () => {
    expect(esRutaPublica("/loginfalso")).toBe(false);
    expect(esRutaPublica("/authorizacion")).toBe(false);
  });
});

describe("rolRequerido", () => {
  it("las pantallas del asesor no exigen rol", () => {
    expect(rolRequerido("/")).toBeNull();
    expect(rolRequerido("/producto/tuberia/cano")).toBeNull();
    expect(rolRequerido("/carrito")).toBeNull();
  });

  it("el panel es de oficina tecnica", () => {
    expect(rolRequerido("/admin")).toBe("oficina_tecnica");
    expect(rolRequerido("/admin/import")).toBe("oficina_tecnica");
    expect(rolRequerido("/admin/links")).toBe("oficina_tecnica");
  });

  it("la gestion de usuarios es solo de admin y gana sobre el prefijo mas corto", () => {
    expect(rolRequerido("/admin/usuarios")).toBe("admin");
    expect(rolRequerido("/admin/usuarios/123")).toBe("admin");
  });

  it("ignora la barra final", () => {
    expect(rolRequerido("/admin/")).toBe("oficina_tecnica");
  });
});

describe("rolAlcanza", () => {
  it("los roles son acumulativos, igual que en las politicas de RLS", () => {
    expect(rolAlcanza("admin", "oficina_tecnica")).toBe(true);
    expect(rolAlcanza("admin", "asesor")).toBe(true);
    expect(rolAlcanza("oficina_tecnica", "asesor")).toBe(true);
  });

  it("un asesor no alcanza para oficina tecnica ni para admin", () => {
    expect(rolAlcanza("asesor", "oficina_tecnica")).toBe(false);
    expect(rolAlcanza("asesor", "admin")).toBe(false);
    expect(rolAlcanza("oficina_tecnica", "admin")).toBe(false);
  });

  it("sin perfil no alcanza para nada", () => {
    expect(rolAlcanza(null, "asesor")).toBe(false);
    expect(rolAlcanza(undefined, "asesor")).toBe(false);
  });
});

describe("puedeVer", () => {
  it("sin sesion solo se ven las rutas publicas", () => {
    expect(puedeVer("/login", null)).toBe(true);
    expect(puedeVer("/", null)).toBe(false);
    expect(puedeVer("/admin", null)).toBe(false);
  });

  it("un asesor ve las pantallas de mostrador pero no el panel", () => {
    expect(puedeVer("/", "asesor")).toBe(true);
    expect(puedeVer("/producto/tuberia/cano", "asesor")).toBe(true);
    expect(puedeVer("/carrito", "asesor")).toBe(true);
    expect(puedeVer("/admin", "asesor")).toBe(false);
    expect(puedeVer("/admin/import", "asesor")).toBe(false);
  });

  it("oficina tecnica entra al panel pero no a usuarios", () => {
    expect(puedeVer("/admin/import", "oficina_tecnica")).toBe(true);
    expect(puedeVer("/admin/usuarios", "oficina_tecnica")).toBe(false);
  });

  it("el admin entra a todo", () => {
    expect(puedeVer("/admin/usuarios", "admin")).toBe(true);
    expect(puedeVer("/carrito", "admin")).toBe(true);
  });
});

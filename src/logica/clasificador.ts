/**
 * Clasificador de catalogo. Port literal de `clasificar()` de referencia/crosssell_bot.py.
 *
 * EL ORDEN DE LAS CONDICIONES ES PARTE DE LA LOGICA. No reordenar "para que quede
 * mas limpio": `JUNTA` se evalua antes que las lineas de valvulas y bombas porque los
 * kits de sello vienen rotulados dentro de esas lineas. Ver CLAUDE.md.
 *
 * Los bloques por `Negocio` no cortan la cascada: si ninguna de sus condiciones internas
 * matchea, la evaluacion sigue con las condiciones de abajo y puede terminar en 'otro'.
 * Ese comportamiento es intencional y viene del original.
 *
 * Equivalencia con el original verificada sobre las 16.973 filas del archivo:
 * ver scripts/verificar-conteos.ts.
 */

export interface FilaClasificable {
  readonly negocio?: string;
  readonly familia?: string;
  readonly tipo?: string;
  readonly desc?: string;
}

/** Codigo de categoria funcional. Coincide con las claves de `categorias` en el JSON de reglas. */
export type CodigoCategoria = string;

/** Categoria de descarte cuando ninguna condicion matchea. */
export const CATEGORIA_OTRO = "otro";

export function clasificar(fila: FilaClasificable): CodigoCategoria {
  const u = (fila.desc ?? "").toUpperCase();
  const t = (fila.tipo ?? "").toUpperCase();
  const f = (fila.familia ?? "").toUpperCase();
  const n = (fila.negocio ?? "").toUpperCase();

  if (n === "SOLDADURA") {
    if (u.includes("TUNGS")) return "tungsteno";
    if (u.includes("VARILLA TIG") || u.startsWith("VAR TIG")) return "varilla_tig";
    if (u.includes("ALAMBRE MIG")) return "alambre_mig";
    if (u.includes("ELECTRODO") || u.includes("ELEC")) return "electrodo_revestido";
  }
  if (n === "AUXILIARES") {
    if (u.includes("DECAPANTE")) return "decapante";
    if (u.includes("PASIV")) return "pasivante";
    if (u.includes("NEUTRALIZ")) return "neutralizante";
    if (u.includes("TINTA PENETRANTE") || u.includes("NDT")) return "ndt";
    if (u.includes("DETECTOR")) return "detector";
    if (u.includes("ANTIADHER") || u.includes("ANTIPROY")) return "antiproyecciones";
    if (u.includes("PASTA CER")) return "respaldo";
    if (u.includes("ROSCA") && (u.includes("PASTA") || u.includes("LUBRIC"))) return "sellador_rosca";
    if (u.includes("FIJADOR") || u.includes("LOCTITE243") || u.includes("LOCTITE 243")) return "sellador_rosca";
    if (
      u.includes("LOCTITE 680") ||
      u.includes("SIKA") ||
      u.includes("ADHESIVO PARA ARQ") ||
      u.includes("SELL")
    ) {
      return "adhesivo_montaje";
    }
    if (u.includes("REVEST")) return "revestimiento";
    if (u.includes("LUBRIC")) return "lubricante";
    if (["LIMP", "DESENGRAS", "CLEAN", "REMOVEDOR", "PULIDOR"].some((k) => u.includes(k))) {
      return "limpieza";
    }
  }
  if (n === "COMBOS CONSUMIBLES") return "combo";
  if (n === "ABRASIVOS") {
    if (u.includes("CORTE")) return "disco_corte";
    if (u.includes("FLAP") || u.includes("LAMINA")) return "flap";
    if (u.includes("LIJA")) return "lija";
    if (u.includes("CARDA") || u.includes("CEPILLO")) return "cepillo";
    if (
      ["VELL", "POLICLEAN", "POLINOX", "PAÑO", "PANO", "RODILLO", "RUEDA"].some((k) => u.includes(k))
    ) {
      return "acabado";
    }
    if (u.includes("PASTA") || u.includes("PULID")) return "pulido";
    if (u.includes("BANDA")) return "banda";
    if (u.includes("FRESA")) return "fresa";
  }

  // Antes de las lineas de valvulas y bombas: los kits de sello vienen rotulados ahi adentro.
  if (f.includes("JUNTA") || t.includes("JUNTA") || u.includes("KIT DE JUNTAS")) return "junta";

  if (n === "BULONERIA") {
    if (f === "TORNILLO" || f === "BULON" || f === "ALLEN" || f === "ESPARRAGO") return "bulon";
    if (f === "TUERCA") return "tuerca";
    if (f === "ARANDELA") return "arandela";
    if (f === "VARILLA ROSCADA") return "varilla_roscada";
    if (f === "ABRAZADERA") return "abrazadera";
    if (f === "REMACHE") return "remache";
    if (f === "CABLES") return "cable";
    return "bulon";
  }
  if (n === "BRIDAS INDUSTRIALES" || n === "BRIDAS SANITARIAS") return "brida";
  if (n === "NIPLES") return "niple";
  if (n === "ACC. P/ SOLDAR SANITARIOS" || n === "ACCESORIOS PHARMA") return "acc_soldar_san";
  if (n === "ACC. P/ SOLDAR INDUSTRIALES") return "acc_soldar_ind";
  if (n === "ACCESORIOS ROSC / SW") return "acc_rosc_sw";
  if (n === "CAÑOS") return "cano";
  if (n === "TUBOS") return "tubo";
  if (n === "UNIONES SANITARIAS") return "union_sanitaria";
  if (n === "VALVULAS INDUSTRIALES") return "valvula_ind";
  if (n === "VALVULAS SANITARIAS") {
    if (f === "ACTUADORES") return "actuador";
    if (f.startsWith("ACC")) return "acc_valvula_san";
    return "valvula_san";
  }
  if (n === "BOMBAS") return f.startsWith("ACC") ? "acc_bomba" : "bomba";
  if (n === "INSTRUMENTACION") return "instrumentacion";
  if (n === "ACCESORIOS P/ TANQUES") return f.includes("LIMPIEZA") ? "sistema_limpieza" : "acc_tanque";
  if (n === "TAPAS Y PUERTAS") return f.includes("ACCESORIO") ? "acc_tapa" : "tapa_puerta";
  if (n === "OTROS L.SAN.") {
    if (f.includes("FILTRO")) return "filtro_san";
    if (f.includes("MIRILLA")) return "mirilla";
    if (f.includes("SOPORTE")) return "soporte_san";
  }
  if (n === "OTROS L.IND.") {
    if (f.includes("ACOPLE")) return "acople_rapido";
    if (f.includes("FILTRO")) return "filtro_ind";
  }
  if (n === "CHAPAS Y BOBINAS") return "chapa";
  if (n === "BARRAS") return "barra";
  if (n === "PLANCHUELAS") return "planchuela";
  if (n === "ANGULOS") return "angulo";
  if (n === "OTRAS M.P." || n === "MEZCLAS") return "otra_mp";
  if (n === "BROCAS") return "broca";
  if (n === "LINEA ARQUITECTURA") {
    if (f.includes("BARANDA") || f.includes("PASAMANO")) return "baranda";
    if (f.includes("GRIFERIA")) return "griferia";
    if (f.includes("VIDRIO")) return "acc_vidrio";
    if (f.includes("HERRAJE")) return "herraje_arq";
    if (f.includes("BAÑO") || f.includes("BANO")) return "acc_bano";
    return "arq_otro";
  }
  if (n === "INOXSALE") {
    if (t.includes("CHAPA") || t.includes("BOBINA")) return "chapa";
    if (t.includes("CAÑO")) return "cano";
    if (t.includes("TUBO")) return "tubo";
    if (t.includes("BRIDA")) return "brida";
    if (["REDUC", "CURVA", "TEE", "COLLAR", "CASQUETE", "CRUZ"].some((k) => t.includes(k))) {
      return "acc_soldar_ind";
    }
    if (["VÁLVULA", "VALVULA", "WAFER", "COMPONENTE"].some((k) => t.includes(k))) return "valvula_ind";
    if (t.includes("PLANCHUELA")) return "planchuela";
    if (t.includes("ANGULO")) return "angulo";
    if (t.includes("PUERTA")) return "tapa_puerta";
    if (["TORNILLO", "ALLEN", "UNC", "BSW", "BUJE", "BULON", "TUERCA"].some((k) => t.includes(k))) {
      return "bulon";
    }
  }
  return CATEGORIA_OTRO;
}

# -*- coding: utf-8 -*-
"""
Lógica de venta cruzada de acero inoxidable — módulo para bot.

Flujo:
  1) clasificar(fila)            -> categoria funcional + grado normalizado
  2) sugerir(categoria, grado)   -> lista de FAMILIAS complementarias (no SKU)
  3) cada familia trae un 'catalogo' (negocios/subfamilias) para que el bot
     consulte la base real y devuelva los SKU/stock vigentes.

Las reglas viven en crosssell_rules.json (misma carpeta). No hay nada inventado:
todas las familias existen en el catálogo.
"""
import json, os, re

_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_DIR, "crosssell_rules.json"), encoding="utf-8") as f:
    RULES = json.load(f)


# ---------------------------------------------------------------------------
# 1) CLASIFICADOR  — mapea una fila del catálogo a una categoría funcional.
#    Campos usados: Negocio, Familia, Tipo, Material Desc, Calidad.
# ---------------------------------------------------------------------------
def normalizar_grado(calidad: str, desc: str = "") -> str | None:
    g = (calidad or "").upper().strip()
    equiv = {"E308": "308L", "E316": "316L", "E310": "310", "E312": "312",
             "310L": "310", "312L": "312"}
    if g in equiv:
        return equiv[g]
    if g and g != "NONE":
        return g
    for k in ["316L", "304L", "316", "304", "430", "420", "310", "309L", "312", "308L"]:
        if k in (desc or "").upper():
            return k
    return None


def clasificar(negocio="", familia="", tipo="", desc="") -> str:
    """Devuelve la categoria funcional (clave de RULES['categorias'])."""
    u, t, f, n = desc.upper(), tipo.upper(), familia.upper(), negocio.upper()

    if n == "SOLDADURA":
        if "TUNGS" in u: return "tungsteno"
        if "VARILLA TIG" in u or u.startswith("VAR TIG"): return "varilla_tig"
        if "ALAMBRE MIG" in u: return "alambre_mig"
        if "ELECTRODO" in u or "ELEC" in u: return "electrodo_revestido"
    if n == "AUXILIARES":
        if "DECAPANTE" in u: return "decapante"
        if "PASIV" in u: return "pasivante"
        if "NEUTRALIZ" in u: return "neutralizante"
        if "TINTA PENETRANTE" in u or "NDT" in u: return "ndt"
        if "DETECTOR" in u: return "detector"
        if "ANTIADHER" in u or "ANTIPROY" in u: return "antiproyecciones"
        if "PASTA CER" in u: return "respaldo"
        if "ROSCA" in u and ("PASTA" in u or "LUBRIC" in u): return "sellador_rosca"
        if "FIJADOR" in u or "LOCTITE243" in u or "LOCTITE 243" in u: return "sellador_rosca"
        if "LOCTITE 680" in u or "SIKA" in u or "ADHESIVO PARA ARQ" in u or "SELL" in u: return "adhesivo_montaje"
        if "REVEST" in u: return "revestimiento"
        if "LUBRIC" in u: return "lubricante"
        if any(k in u for k in ("LIMP", "DESENGRAS", "CLEAN", "REMOVEDOR", "PULIDOR")): return "limpieza"
    if n == "COMBOS CONSUMIBLES": return "combo"
    if n == "ABRASIVOS":
        if "CORTE" in u: return "disco_corte"
        if "FLAP" in u or "LAMINA" in u: return "flap"
        if "LIJA" in u: return "lija"
        if "CARDA" in u or "CEPILLO" in u: return "cepillo"
        if any(k in u for k in ("VELL", "POLICLEAN", "POLINOX", "PAÑO", "PANO", "RODILLO", "RUEDA")): return "acabado"
        if "PASTA" in u or "PULID" in u: return "pulido"
        if "BANDA" in u: return "banda"
        if "FRESA" in u: return "fresa"

    if "JUNTA" in f or "JUNTA" in t or "KIT DE JUNTAS" in u: return "junta"

    if n == "BULONERIA":
        if f in ("TORNILLO", "BULON", "ALLEN", "ESPARRAGO"): return "bulon"
        if f == "TUERCA": return "tuerca"
        if f == "ARANDELA": return "arandela"
        if f == "VARILLA ROSCADA": return "varilla_roscada"
        if f == "ABRAZADERA": return "abrazadera"
        if f == "REMACHE": return "remache"
        if f == "CABLES": return "cable"
        return "bulon"
    if n in ("BRIDAS INDUSTRIALES", "BRIDAS SANITARIAS"): return "brida"
    if n == "NIPLES": return "niple"
    if n in ("ACC. P/ SOLDAR SANITARIOS", "ACCESORIOS PHARMA"): return "acc_soldar_san"
    if n == "ACC. P/ SOLDAR INDUSTRIALES": return "acc_soldar_ind"
    if n == "ACCESORIOS ROSC / SW": return "acc_rosc_sw"
    if n == "CAÑOS": return "cano"
    if n == "TUBOS": return "tubo"
    if n == "UNIONES SANITARIAS": return "union_sanitaria"
    if n == "VALVULAS INDUSTRIALES": return "valvula_ind"
    if n == "VALVULAS SANITARIAS":
        if f == "ACTUADORES": return "actuador"
        if f.startswith("ACC"): return "acc_valvula_san"
        return "valvula_san"
    if n == "BOMBAS":
        return "acc_bomba" if f.startswith("ACC") else "bomba"
    if n == "INSTRUMENTACION": return "instrumentacion"
    if n == "ACCESORIOS P/ TANQUES":
        return "sistema_limpieza" if "LIMPIEZA" in f else "acc_tanque"
    if n == "TAPAS Y PUERTAS":
        return "acc_tapa" if "ACCESORIO" in f else "tapa_puerta"
    if n == "OTROS L.SAN.":
        if "FILTRO" in f: return "filtro_san"
        if "MIRILLA" in f: return "mirilla"
        if "SOPORTE" in f: return "soporte_san"
    if n == "OTROS L.IND.":
        if "ACOPLE" in f: return "acople_rapido"
        if "FILTRO" in f: return "filtro_ind"
    if n == "CHAPAS Y BOBINAS": return "chapa"
    if n == "BARRAS": return "barra"
    if n == "PLANCHUELAS": return "planchuela"
    if n == "ANGULOS": return "angulo"
    if n in ("OTRAS M.P.", "MEZCLAS"): return "otra_mp"
    if n == "BROCAS": return "broca"
    if n == "LINEA ARQUITECTURA":
        if "BARANDA" in f or "PASAMANO" in f: return "baranda"
        if "GRIFERIA" in f: return "griferia"
        if "VIDRIO" in f: return "acc_vidrio"
        if "HERRAJE" in f: return "herraje_arq"
        if "BAÑO" in f or "BANO" in f: return "acc_bano"
        return "arq_otro"
    if n == "INOXSALE":
        if "CHAPA" in t or "BOBINA" in t: return "chapa"
        if "CAÑO" in t: return "cano"
        if "TUBO" in t: return "tubo"
        if "BRIDA" in t: return "brida"
        if any(k in t for k in ("REDUC", "CURVA", "TEE", "COLLAR", "CASQUETE", "CRUZ")): return "acc_soldar_ind"
        if any(k in t for k in ("VÁLVULA", "VALVULA", "WAFER", "COMPONENTE")): return "valvula_ind"
        if "PLANCHUELA" in t: return "planchuela"
        if "ANGULO" in t: return "angulo"
        if "PUERTA" in t: return "tapa_puerta"
        if any(k in t for k in ("TORNILLO", "ALLEN", "UNC", "BSW", "BUJE", "BULON", "TUERCA")): return "bulon"
    return "otro"


# ---------------------------------------------------------------------------
# 2) SUGERIDOR — dada una categoria (la del producto que compra el cliente),
#    devuelve las familias complementarias a nivel FAMILIA.
# ---------------------------------------------------------------------------
def sugerir(categoria: str, grado: str | None = None) -> dict:
    """
    categoria: clave de RULES['tipos'] (lo que está comprando el cliente).
    grado:     '304' | '316' | '310' | ... (opcional). Afina el aporte.
    Devuelve {nombre, dominio, complementos:[...], notas:[...]}.
    Cada complemento trae: nombre, prioridad, motivo, familias[], y por cada
    familia su 'catalogo' (negocios/subfamilias) para consultar la BD real.
    """
    tipo = RULES["tipos"].get(categoria)
    if not tipo:
        return {"error": f"sin reglas para '{categoria}'", "complementos": []}

    out = {"producto": tipo["nombre"], "dominio": tipo["dominio"],
           "grado": grado, "complementos": [],
           "notas": RULES["notas_por_dominio"].get(tipo["dominio"], [])}

    for cp in tipo["complementos"]:
        familias = []
        motivo = cp["motivo"]
        cats = list(cp["familias"])

        # Si depende del grado y hay grado conocido -> apunta al aporte correcto
        if cp["depende_del_grado"] and grado in RULES["aporte_por_grado"]:
            ap = RULES["aporte_por_grado"][grado]
            motivo = f"Aporte {ap['aporte']}: {ap['motivo']} {motivo}".strip()

        for cat in cats:
            c = RULES["categorias"].get(cat, {})
            familias.append({
                "categoria": cat,
                "etiqueta": c.get("etiqueta", cat),
                "catalogo": c.get("catalogo", {}),   # negocios / subfamilias / total
            })

        out["complementos"].append({
            "nombre": cp["nombre"],
            "prioridad": cp["prioridad"],
            "motivo": motivo,
            "familias": familias,
        })
    return out


def sugerir_desde_fila(negocio="", familia="", tipo="", desc="", calidad="") -> dict:
    """Atajo: clasifica una fila del catálogo y devuelve las sugerencias."""
    cat = clasificar(negocio, familia, tipo, desc)
    grado = normalizar_grado(calidad, desc)
    res = sugerir(cat, grado)
    res["clasificado_como"] = cat
    return res


# ---------------------------------------------------------------------------
# DEMO
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    ejemplos = [
        dict(negocio="BRIDAS INDUSTRIALES", familia="BRIDAS SLIP ON", tipo="Brida", desc='BRIDA SLIP ON 2" 316L', calidad="316L"),
        dict(negocio="CAÑOS", familia="CAÑOS REDONDOS", tipo="", desc='CAÑO REDONDO 2" 304', calidad="304"),
        dict(negocio="SOLDADURA", familia="SOLDADURA", tipo="", desc="ELECTRODO TUNGSTENO 2,40MM WT20", calidad=""),
        dict(negocio="BULONERIA", familia="BULON", tipo="", desc="BULON HEXAGONAL M10 304", calidad="304"),
        dict(negocio="UNIONES SANITARIAS", familia="UNION SANITARIAS N. CLAMP", tipo="", desc='ABRAZADERA CLAMP 1 1/2" 304', calidad="304"),
    ]
    for e in ejemplos:
        r = sugerir_desde_fila(**e)
        print("\n" + "=" * 70)
        print(f"PRODUCTO: {e['desc']}  ->  [{r.get('clasificado_como')}]  grado={r.get('grado')}")
        print(f"  ({r.get('producto')})")
        for cp in r["complementos"]:
            fams = ", ".join(f["etiqueta"] for f in cp["familias"])
            print(f"  [{cp['prioridad'].upper():6s}] {cp['nombre']}  ->  {fams}")

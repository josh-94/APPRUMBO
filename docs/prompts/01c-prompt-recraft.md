# Prompt 1c — Logo de Rumbo en Recraft

## Antes de empezar

- **Plan gratuito:** 30 generaciones al día y exportación en SVG. Lo que generas gratis es público, le pertenece a Recraft y no tiene licencia comercial ([condiciones](https://recraft.mintlify.dev/docs/plans-and-billing/commercial-rights-and-ownership)).
- **Plan de pago:** lo que generas mientras estás suscrito es tuyo, con derechos comerciales, aunque después canceles. La propiedad depende del plan que tenías al momento de generar.
- **Flujo recomendado:** explora gratis hasta encontrar la versión que te guste, paga un mes del plan más barato y vuelve a generar la versión final con el mismo prompt.

## Configuración en cada generación

- **Modelo o estilo:** Recraft V4 Vector (o "Vector"/"Logo"), no el de imagen o foto.
- **Colores:** cárgalos en el selector de paleta, no solo en el texto: `#C2461F`, `#9E3714`, `#F4B860`, `#1F1A1C`, `#FAF6F2`.
- **Formato:** 1:1.

Genera por partes, en este orden. Las especificaciones salen de la sección 5.1 de [`manual-de-marca.md`](../marca/manual-de-marca.md) (dirección "la aguja").

---

## 1. Símbolo solo (empieza por aquí)

```text
Minimal flat vector logo symbol: a slim compass needle shaped like an elongated rhombus (about 1:3 ratio), rotated 45 degrees so it points to the upper right. The needle is split lengthwise into two facets: upper-left facet terracotta #C2461F, lower-right facet deep terracotta #9E3714, like a folded paper needle. A small solid sand gold #F4B860 circle sits exactly at the center as the pivot. Sharp points, perfectly symmetric, geometric, no gradients, no shadows, no outline, no compass ring, no text, centered on a plain warm off-white #FAF6F2 background with generous empty space.
```

## 2. Ícono de app

```text
App icon, rounded square filled with solid warm near-black #1F1A1C, corner radius 22 percent. Centered inside: a slim compass needle shaped like an elongated rhombus, rotated 45 degrees pointing to the upper right, split lengthwise into two facets, upper-left terracotta #C2461F, lower-right deep terracotta #9E3714, with a small sand gold #F4B860 circle at the center. The needle spans about 62 percent of the diagonal. Flat vector, no gradients, no glow, no text, must stay legible at 48 pixels.
```

## 3. Logo horizontal (símbolo + nombre)

```text
Horizontal logo lockup on warm off-white #FAF6F2 background: on the left, a slim two-tone terracotta compass needle (#C2461F upper-left facet, #9E3714 lower-right facet) rotated 45 degrees pointing to the upper right, with a small sand gold #F4B860 pivot dot at its center; on the right, the wordmark "rumbo" in lowercase only, friendly geometric grotesque sans serif, extra bold, tight letter spacing, warm near-black #231D1F. The needle is slightly taller than the lowercase letters and its tip rises above them. Flat vector, no gradients, no shadows, no tagline, no other text.
```

## 4. Versión sobre fondo oscuro

```text
Same horizontal logo on solid warm near-black #1F1A1C background: two-tone terracotta compass needle (#C2461F and #9E3714) pointing to the upper right with a small sand gold #F4B860 pivot dot, wordmark "rumbo" in lowercase white extra bold geometric sans serif. Flat vector, no gradients, no shadows.
```

---

## Consejos

1. **Itera primero el símbolo** (5 o 6 veces) y elige el mejor. Luego úsalo como imagen de referencia ("image to image" o similar) para el ícono y el logo horizontal, así los tres quedan con la misma aguja.
2. **Si Recraft dibuja una brújula completa** (círculo, letras N/S/E/O, cuatro puntas), agrega al prompt: `only the single needle, no circle, no cardinal letters, no second needle`.
3. **Si las dos facetas salen del mismo color o con degradado**, agrega: `two flat solid colors divided by a straight line along the needle's long axis`.
4. **Si el texto "rumbo" sale mal o en mayúsculas**, genera solo el símbolo y arma el wordmark en Figma escribiendo "rumbo" en Bricolage Grotesque ExtraBold con tracking -3 %.
5. **La versión monocroma no se genera:** recolorea el SVG a un solo color (`#231D1F` o blanco), separa las facetas con una línea fina y deja el eje hueco, en el editor de Recraft o en Figma.
6. **Guarda los SVG finales** en `docs/marca/logo/` con nombres claros: `rumbo-simbolo.svg`, `rumbo-icono-app.svg`, `rumbo-horizontal.svg`, `rumbo-horizontal-oscuro.svg`, `rumbo-mono-negro.svg`, `rumbo-mono-blanco.svg`.

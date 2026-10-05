# Prompt 1 — Manual de marca de RUMBO

## Cómo usar este prompt

1. Pégalo completo en Cursor (chat con Claude o GPT, modo Agent) con el repo abierto, o en cualquier IA de texto (Claude, ChatGPT, Gemini).
2. La IA te hará máximo 5 preguntas. Respóndelas y pídele que continúe.
3. El resultado debe quedar guardado en `docs/marca/manual-de-marca.md` (si lo usas fuera de Cursor, copia la respuesta a ese archivo).
4. Cuando tengas el manual, lleva la sección de identidad visual a una herramienta de IA visual (ver "Herramientas IA para la parte visual" al final) para generar logo, variantes y mockups.
5. Recién después pasa al `02-prompt-producto.md`.

---

## PROMPT (copiar desde aquí)

```text
# ROL

Actúa como un equipo senior de branding compuesto por: un director de estrategia de marca, un director de arte especializado en productos digitales móviles, un estratega de marketing de crecimiento para apps de consumo en Latinoamérica y un UX writer. Tienes 15 años de experiencia lanzando marcas de fintech y productividad para público joven. Piensas con rigor estratégico pero entregas de forma concreta, accionable y lista para usar en diseño y desarrollo.

# CONTEXTO DEL PROYECTO

Nombre de la app: RUMBO.
Tipo: aplicación móvil (PWA instalable, mobile-first) para Perú como mercado inicial, con proyección a Latinoamérica. Idioma: español, con tuteo.

Qué es hoy: nació como un planificador personal del día (tareas de "Hoy", vista de semana, listas, recordatorios con hora, acceso con correo o Google). La identidad actual es provisional: tonos papel/crema (#f3efe7), tinta oscura (#1c1915), acento verde-azulado (#0e6e68) y títulos en serif Palatino. Esa identidad debe ser reemplazada por completo; no la conserves salvo que lo justifiques estratégicamente.

Hacia dónde va: RUMBO será una app de "vida organizada" que une dos cosas que hoy viven en apps separadas:
1. Organización personal: tareas, agenda, creación de hábitos y rutinas.
2. Finanzas personales: control de gastos e ingresos, egresos, líneas de crédito y tarjetas, consumos y suscripciones, metas de ahorro, deudas.

La promesa central: una sola app que te ayuda a tomar el control de tu tiempo y de tu plata, sin exigirte tiempo que no tienes.

# PÚBLICO OBJETIVO

Jóvenes de 25 a 35 años que trabajan y tienen una vida ocupada y agitada. Son modernos, digitales, usan el celular para todo. Tienen trabajos de oficina (corporativo, startups, freelance) o de campo (ventas, operaciones, minería, construcción, salud, logística). Su principal problema es la falta de tiempo: por eso les cuesta construir nuevos hábitos, controlar sus gastos y llevar una vida organizada. Sienten que el mes se les va sin saber en qué, que postergan lo importante y que las apps de productividad o finanzas que probaron eran demasiado complejas, frías o les pedían demasiada disciplina.

Insight a trabajar: no quieren "ser más productivos", quieren sentir que tienen el control y que avanzan hacia algo (de ahí el nombre RUMBO).

# REFERENCIA VISUAL (ESTRUCTURAL, NO CROMÁTICA)

Tengo una app de referencia cuya estructura de interfaz me gusta y quiero que RUMBO siga esa lógica de formas, jerarquía y espaciado. Usa estos datos únicamente como referencia estructural. RUMBO debe tener paleta de colores, tipografía y personalidad PROPIAS; está prohibido copiar sus colores o fuentes.

Patrones de interfaz de la referencia:
- Cabecera con saludo ("Hola, Nombre") en píldora blanca + fecha en píldora a la derecha.
- Titular grande en dos tonos: una línea en color apagado y la siguiente en negrita ("Todo listo, / no tienes nada pendiente").
- Carrusel horizontal de tarjetas con imagen de fondo y etiqueta ("Recuerda", "Tip") para contenido editorial.
- Grid de 3 tarjetas de acceso rápido con ícono dentro de círculo de color suave + etiqueta corta.
- Tarjeta oscura de resumen (plan/estado) con texto claro y un anillo de progreso a la derecha.
- Semana como fila de chips con día, número y estado.
- Barra de progreso lineal con etiqueta izquierda y valor derecha ("30 de 40").
- Tab bar flotante oscura, redondeada, con la pestaña activa como píldora de color de acento + texto, y las inactivas solo como ícono.
- Pantalla de cuenta con cabecera de gradiente suave, avatar circular grande, nombre, teléfono y badges (plan, dirección), seguida de tarjetas de acciones.

Tokens de la referencia (para dimensionar formas y jerarquía, no para color):
- Radio de tarjeta: 20 px. Radio de píldora/botón: 999 px. Radios secundarios: 10, 12, 14, 18 px.
- Sombras: suave (0 1px 2px) y media (0 2px 6px + 0 14px 30px -16px) con muy baja opacidad.
- Escala tipográfica: 30 / 24 / 19 / 15 / 13.5 / 11.5 px. Tracking en titulares: -0.03em. Etiquetas pequeñas en mayúsculas con tracking amplio.
- Fondo general en tono muy claro ligeramente tintado; tarjetas blancas; una tarjeta oscura de énfasis por pantalla.
- Iconografía lineal (estilo Tabler), trazo 1.5–2 px.

# TAREA

Antes de producir nada, hazme como máximo 5 preguntas que realmente cambien el resultado (por ejemplo: modelo de monetización, si habrá versión gratuita, si quiero un nombre de empresa separado del producto, tono más serio o más desenfadado, si tengo restricciones de color). Si no respondo algo, asume lo más razonable y decláralo.

Luego genera el MANUAL DE MARCA DE RUMBO completo en Markdown, con estas secciones y este nivel de detalle:

## 1. Esencia de marca
- Propósito (por qué existe), visión, misión.
- 4 a 5 valores, cada uno con una frase de "cómo se ve en el producto".
- Personalidad: arquetipo principal y secundario (justificados), 5 adjetivos que SÍ somos y 5 que NO somos.

## 2. Público objetivo
- 3 buyer personas con nombre, edad, ciudad peruana, trabajo (una de oficina, una de campo, una híbrida/freelance), ingreso aproximado en soles, rutina diaria, dispositivos, apps que usa, frustraciones, lo que ya intentó y por qué falló.
- Para cada persona: jobs-to-be-done (funcional, emocional, social), dolores, ganancias deseadas, momentos del día en que usaría RUMBO y cuánto tiempo tiene en cada momento.
- Disparadores de adopción y razones de abandono.

## 3. Posicionamiento
- Declaración de posicionamiento en formato: "Para [público] que [necesidad], RUMBO es [categoría] que [beneficio clave]. A diferencia de [alternativas], RUMBO [diferenciador]".
- Mapa competitivo con al menos: Todoist, Notion, Google Tasks/Calendar, TickTick, Fintonic, Mobills, Monefy, Wallet, YNAB, la hoja de cálculo y la libreta. Para cada uno: en qué es fuerte, en qué falla para nuestro público.
- Territorio de marca propio (la idea que ningún competidor está ocupando) y 3 razones para creer.
- Propuesta de valor en una línea y en versión de 3 líneas.

## 4. Nombre, tagline y voz
- Significado y narrativa del nombre RUMBO; cómo usarlo (mayúsculas, con/sin artículo, cómo se escribe en texto corrido, cómo NO usarlo).
- 5 opciones de tagline con racional, y una recomendación.
- Tono de voz: 4 principios con ejemplos de "así sí / así no". Debe ser directo, cercano, en tuteo, sin jerga financiera ni de productividad, con humor sutil pero sin infantilizar.
- Guía de microcopy: 2 ejemplos reales para cada caso: estado vacío, confirmación de acción, error, logro/racha, recordatorio push, gasto registrado, presupuesto excedido, hábito completado.
- Glosario de términos del producto (cómo llamamos a las cosas: "tarea", "hábito", "movimiento", "gasto", "meta", "racha", etc.) y palabras prohibidas.

## 5. Identidad visual
### 5.1 Logotipo
- Concepto del símbolo (2 a 3 direcciones conceptuales, cada una con descripción detallada para que un diseñador o una IA de imagen pueda generarlo; incluye un prompt de generación en inglés por cada dirección).
- Recomendación de dirección y por qué.
- Sistema: versión principal, versión apilada, isotipo solo, versión monocroma, versión sobre fondo oscuro, versión mínima para ícono de app 48 px.
- Área de seguridad, tamaño mínimo, usos incorrectos (lista).
### 5.2 Paleta de colores
- Color primario y secundario con hex, nombre propio de marca y racional psicológico vinculado al público (control, avance, calma, energía).
- Colores semánticos obligatorios: ingreso, gasto, alerta/presupuesto excedido, éxito/hábito completado, información. Deben distinguirse entre sí y no chocar con el primario.
- Neutrales: fondo general (tintado muy sutil), superficie de tarjeta, tarjeta oscura de énfasis, tinta principal, tinta secundaria, línea/borde, estado deshabilitado.
- Verificación de contraste WCAG AA de cada combinación texto/fondo propuesta (indicar ratio aproximado).
- Reglas de uso: proporción 60/30/10, dónde va el acento (tab activa, CTA primario, anillo de progreso), qué nunca se colorea.
- Versión para modo oscuro de toda la paleta.
### 5.3 Tipografía
- Familia para titulares y familia para texto (deben estar disponibles en Google Fonts o ser variables de sistema). Justifica legibilidad en pantallas pequeñas y con números (tabular figures para montos).
- Escala tipográfica completa (puedes basarte en 30/24/19/15/13.5/11.5 px) con peso, interlineado y tracking por nivel, y en qué se usa cada nivel.
- Tratamiento de montos en soles (S/ 1,250.00): formato, tamaño, color según signo.
### 5.4 Iconografía, formas, ilustración y motion
- Set de íconos recomendado (Tabler, Phosphor o Lucide) y reglas de trazo y tamaño.
- Sistema de formas: radios (tarjeta 20 px, píldora 999 px, secundarios), sombras, espaciado base (4/8 px), grosor de bordes.
- Estilo de ilustración/imagen para las tarjetas editoriales y onboarding (fotografía, 3D, flat; describir con un prompt de ejemplo).
- Principios de motion: duraciones, easing, qué anima (progreso, rachas, check de tarea) y qué no.

## 6. Design tokens listos para el repo
- Bloque de CSS variables bajo `:root` con prefijo `--rumbo-` (colores, semánticos, neutrales, radios, sombras, escala tipográfica, espaciado), más bloque `[data-theme="dark"]`.
- El mismo contenido en JSON (formato compatible con Style Dictionary / W3C design tokens).
- Mapeo de los componentes de la referencia estructural a tokens: tab bar flotante, píldora activa, tarjeta oscura de resumen, anillo de progreso, chips de semana, grid de accesos rápidos, cabecera de saludo.

## 7. Aplicaciones de marca
- Ícono de app (iOS/Android/PWA) y splash: descripción y prompt de generación.
- Plantilla de capturas para tiendas y para la página de instalación de la PWA: 5 pantallas, cada una con titular y subtítulo.
- Plantillas para redes: post, historia, reel cover.
- Firma de correo, favicon, imagen OG para la web.

## 8. Marketing y posicionamiento en mercado
- Mensajes clave por buyer persona (3 por persona) y objeciones con respuesta.
- Canales priorizados para 25–35 en Perú (TikTok, Instagram, LinkedIn, WhatsApp, comunidades) con el rol de cada uno.
- 5 pilares de contenido con 3 ideas concretas de piezas por pilar.
- Plan de lanzamiento de 90 días: pre-lanzamiento (lista de espera, beta cerrada), lanzamiento, post-lanzamiento, con objetivos medibles por fase.
- Métricas de marca a seguir (recordación, NPS, CAC orgánico, tasa de instalación de la PWA).

## 9. Resumen ejecutivo y checklist
- Una página que resume la marca (esencia, posicionamiento, paleta, tipografía, tagline) para compartir con cualquier colaborador.
- Checklist de entregables pendientes para completar el kit de marca (archivos SVG, fuentes, mockups).

# FORMATO DE SALIDA

- Todo en español, en Markdown, con encabezados numerados como arriba.
- Colores siempre con hex y nombre. Tablas para paletas, personas y mapa competitivo. Diagramas mermaid donde ayuden (mapa de posicionamiento, arquitectura de marca).
- Sé concreto: nada de "colores vibrantes y modernos"; di exactamente cuál, por qué y dónde se usa.
- Si estás en Cursor, guarda el resultado en `docs/marca/manual-de-marca.md` y los tokens también en `docs/marca/tokens.css` y `docs/marca/tokens.json`.
- Termina con una lista de 3 decisiones que recomiendas que yo valide antes de pasar a diseño de producto.
```

---

## Herramientas IA para la parte visual

El prompt de arriba produce la estrategia y las especificaciones. Para convertirlas en logo, variantes y mockups usa alguna de estas (verificadas en octubre 2026):

| Necesidad | Herramienta | Por qué |
| --- | --- | --- |
| Estrategia, manual, tono de voz, tokens (texto) | Cursor con Claude o GPT ejecutando este prompt | Es lo que mejor razona posicionamiento y escribe microcopy; además deja los archivos directo en el repo. |
| Identidad visual completa con tokens para código | [Glyph](https://glyph.software/) | Genera estrategia, logo con variantes, paleta claro/oscuro, tipografía, brand book PDF y tokens CSS/React, más una guía de implementación para Cursor. Es el mejor encaje porque el siguiente paso es desarrollar. |
| Identidad visual guiada por estrategia, kit exportable | [Branda](https://branda.co/) | Parte de arquetipo y posicionamiento, luego logo (principal, apilado, símbolo, oscuro, claro), paleta con hex y pares tipográficos. Acepta importar tu manual o assets existentes. |
| Sistema de marca vivo para el repo | [Kromi](https://kromi.netlify.app/) | Convierte el manual en un sitio de marca editable y exporta `DESIGN.md` con tokens que Cursor/Claude Code leen directamente. Se conecta por MCP. |
| Logo e isotipo en vector | Recraft, Ideogram | Buenos renderizando texto y formas limpias; usa los prompts de generación que entrega la sección 5.1 del manual. |
| Paleta y contraste | Coolors, Realtime Colors, WebAIM Contrast Checker | Para ajustar la paleta propuesta y validar WCAG AA sobre pantallas reales. |
| Mockups de pantallas | Google Stitch, Figma Make, v0 | Alimentarlos con el manual y los tokens para ver RUMBO con la estructura de la app de referencia antes de programar. |

Flujo sugerido: prompt 1 en Cursor → manual + tokens → Glyph o Branda para logo y kit visual → ajustar paleta en Coolors si hace falta → mockups en Stitch/Figma Make → prompt 2.

## Cómo saber qué tecnología usa una app web (lo que hice con la referencia)

- Abre `view-source:https://la-app.com` en el navegador de escritorio y busca: `id="root"` + `/static/js/main.[hash].js` (Create React App), `_next` o `__NEXT_DATA__` (Next.js), `__NUXT__` (Nuxt), `data-svelte` (Svelte), clases `MuiButton-root` (MUI), `--tw-` en el CSS (Tailwind), `flutter` (Flutter web).
- DevTools (F12) > pestaña Network o Sources: los nombres de los bundles y las fuentes cargadas (Google Fonts) revelan librerías y tipografías.
- DevTools > Elements > `:root` muestra las CSS variables (design tokens) de la app.
- Extensiones: Wappalyzer o React Developer Tools; o pega la URL en builtwith.com.

En la referencia encontré: Create React App, React, MUI + Emotion, partes de Ant Design, íconos Tabler, Swiper, dayjs, axios; fuentes Poppins y Days One; tokens `--af-*` con radio de tarjeta 20 px y píldora 999 px.

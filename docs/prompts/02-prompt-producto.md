# Prompt 2 — Especificación de producto de RUMBO

## Cómo usar este prompt

1. Úsalo después de tener `docs/marca/manual-de-marca.md` (resultado del prompt 1). Si lo ejecutas en Cursor, la IA puede leer ese archivo directamente; si lo usas fuera, pega al menos las secciones 1, 3, 4 y 6 del manual debajo del prompt.
2. Pégalo completo en Cursor (modo Agent o Plan) o en otra IA de texto.
3. La IA te hará máximo 5 preguntas. Respóndelas y pídele que continúe.
4. El resultado debe quedar en `docs/producto/especificacion.md`. Es una especificación de producto independiente de la tecnología: define qué hace RUMBO, no cómo se programa.
5. Con la especificación lista, cada épica del backlog final se puede pegar como prompt de implementación en Cursor.

---

## PROMPT (copiar desde aquí)

```text
# ROL

Actúa como un equipo de producto senior: un Product Manager con experiencia en apps de finanzas personales y productividad para consumo masivo en Latinoamérica, un diseñador UX especializado en mobile-first y en reducir fricción para usuarios con poco tiempo, y un analista de datos de producto. Piensas en resultados de usuario, no en listas de features. Eres concreto, priorizas sin piedad y entregas documentos que un equipo de desarrollo puede ejecutar sin volver a preguntar.

# CONTEXTO

Producto: RUMBO, app móvil (PWA instalable, mobile-first) para Perú con proyección a Latinoamérica. Español, tuteo.

Insumo obligatorio: el manual de marca en `docs/marca/manual-de-marca.md` (esencia, público objetivo, buyer personas, posicionamiento, tono de voz, glosario y tokens visuales). Léelo primero y respeta su vocabulario y su tono en todo lo que escribas. Si algo del manual contradice lo que te pido aquí, señálalo en lugar de ignorarlo.

Qué existe hoy (MVP actual): planificador personal del día con vista "Hoy", vista "Semana", listas, tareas con hora y recordatorio, acceso con correo o Google, instalable en el teléfono. Es la base que se conserva y se extiende; no se descarta.

Hacia dónde va: RUMBO une en una sola app dos dominios que hoy viven separados:
1. ORGANIZACIÓN PERSONAL: tareas, agenda/calendario, creación de hábitos y rutinas.
2. FINANZAS PERSONALES: control de gastos e ingresos, egresos, cuentas, líneas de crédito y tarjetas (fecha de corte y de pago), consumos y suscripciones recurrentes, presupuestos por categoría, metas de ahorro, deudas.

Promesa: una sola app que te ayuda a tomar el control de tu tiempo y de tu plata sin exigirte tiempo que no tienes. El diferenciador está en el cruce de ambos dominios (por ejemplo: la cuota de la tarjeta aparece como tarea el día de pago; un hábito puede tener impacto económico visible; el resumen semanal muestra tiempo y dinero juntos).

Público: personas de 25 a 35 años que trabajan, con vida agitada, trabajos de oficina o de campo, poco tiempo, que ya intentaron apps de productividad o finanzas y las abandonaron por complejas o por exigir demasiada disciplina. Las 3 buyer personas del manual son la referencia; cada decisión de producto debe citar a cuál persona sirve.

Restricciones del MVP: sin integración bancaria automática (registro manual rápido, posible importación por texto/foto más adelante); moneda principal soles (S/) con soporte de dólares; debe funcionar razonablemente offline como PWA; los datos financieros son sensibles y requieren privacidad por defecto.

# REFERENCIA DE INTERFAZ (ESTRUCTURAL)

La interfaz debe seguir estos patrones, que ya están mapeados a tokens en el manual de marca:
- Cabecera: saludo "Hola, Nombre" en píldora + fecha en píldora a la derecha.
- Titular de estado en dos tonos (línea apagada + línea en negrita) que resume el día: "Todo listo, / no tienes nada pendiente" o "Te quedan 3 cosas / y S/ 120 de presupuesto".
- Carrusel horizontal de tarjetas editoriales con etiqueta ("Recuerda", "Tip", "Logro") y botón de cerrar.
- Grid de 3 tarjetas de acceso rápido con ícono en círculo de color suave.
- Tarjeta oscura de resumen con anillo de progreso (ejemplo: presupuesto del mes o progreso de hábitos de la semana).
- Semana como fila de chips (día, número, estado).
- Barras de progreso lineales con etiqueta y valor ("S/ 820 de S/ 1,200").
- Tab bar flotante oscura con la pestaña activa como píldora de acento con texto; máximo 5 pestañas.
- Pantalla de cuenta con avatar grande, nombre, badges y grid de acciones.
- Hojas inferiores (bottom sheets) para crear y editar; nunca formularios de página completa para acciones frecuentes.

# TAREA

Antes de producir nada, hazme como máximo 5 preguntas que realmente cambien el resultado (por ejemplo: si habrá plan gratuito y de pago, si quiero cuentas compartidas en pareja, si el MVP incluye finanzas completas o empieza por gastos, si hay fecha objetivo de lanzamiento, qué tan importante es el modo offline). Si no respondo algo, asume lo más razonable y decláralo.

Luego genera la ESPECIFICACIÓN DE PRODUCTO DE RUMBO completa en Markdown, con estas secciones:

## 1. Visión de producto y principios
- Visión en una frase y "North Star Metric" propuesta con justificación.
- 6 a 8 principios de producto/UX medibles. Ejemplos del nivel esperado: "registrar un gasto toma menos de 10 segundos y máximo 3 toques", "nada requiere configuración antes de dar valor el primer día", "cada pantalla responde la pregunta ¿qué hago ahora?", "nunca castigamos: una racha rota se comunica como reinicio, no como fracaso".
- Qué NO es RUMBO (anti-alcance explícito).

## 2. Mapa de módulos
Describe cada módulo con propósito, a qué buyer persona sirve más y cómo se conecta con los demás:
- INICIO (hub del día): estado del día en dos tonos, accesos rápidos, resumen de tiempo y dinero, carrusel de contenido contextual.
- ORGANIZACIÓN: tareas (hoy, semana, listas), agenda/calendario, hábitos (frecuencia, rachas, recordatorios), rutinas (bloques de hábitos/tareas repetibles, ej. "rutina de mañana").
- FINANZAS: cuentas (efectivo, débito, billeteras como Yape/Plin), movimientos (ingreso, gasto, transferencia), categorías, presupuestos mensuales por categoría, tarjetas y líneas de crédito (límite, usado, fecha de corte, fecha de pago, pago mínimo), consumos y suscripciones recurrentes, metas de ahorro, deudas (que debo / me deben).
- INSIGHTS: resumen semanal y mensual que cruza tiempo y dinero; tendencias; alertas.
- CUENTA: perfil, preferencias, moneda, notificaciones, privacidad, exportar datos, soporte.
Incluye un diagrama mermaid del mapa de módulos y sus relaciones.

## 3. Detalle por módulo
Para CADA módulo y submódulo:
- Historias de usuario en formato "Como [persona], quiero [acción] para [resultado]" con criterios de aceptación en Given/When/Then.
- Reglas de negocio (ej.: cómo se calcula el "disponible" del mes, qué pasa con un hábito semanal si se cumple 2 de 3 veces, cómo se trata una cuota de tarjeta como tarea, cómo se maneja un movimiento en dólares).
- Estados de pantalla: vacío (con el microcopy del manual), cargando, error, sin conexión, éxito.
- Notificaciones: cuáles, cuándo, con qué texto, y cómo el usuario las controla.
- Atajos de captura rápida (ej.: registrar gasto desde la tab bar o desde un widget, crear tarea con lenguaje natural "pagar luz mañana 6pm").

## 4. Flujos clave
Diagramas mermaid (flowchart o sequenceDiagram) para al menos:
- Onboarding del primer día (sin pedir configuración completa; valor en menos de 2 minutos).
- Registrar un gasto en 3 toques.
- Crear un hábito y completar la racha semanal.
- Registrar una tarjeta de crédito y ver su fecha de pago convertida en tarea.
- Revisar el resumen semanal de tiempo y dinero.
- Reprogramar una tarea o un pago.

## 5. Inventario de pantallas y navegación
- Propuesta de tab bar (4 o 5 pestañas) con nombre, ícono y qué contiene cada una, justificada contra los principios.
- Lista completa de pantallas y hojas inferiores con: ruta, objetivo, componentes de la referencia estructural que usa (tarjeta oscura con anillo, grid de accesos, chips de semana, etc.), datos que muestra, acciones disponibles.
- Mapa de navegación en mermaid.
- Wireframes en texto (ASCII) de las 5 pantallas principales.

## 6. Priorización y roadmap
- Tabla MoSCoW de todas las funcionalidades.
- Roadmap en tres fases con alcance y criterio de salida:
  - MVP: lo mínimo que entrega la promesa de "tiempo + plata" partiendo de las tareas que ya existen.
  - v1: finanzas completas (tarjetas, presupuestos, metas) e insights.
  - v2: lo que amplía (importación de movimientos, compartir con pareja, widgets, integraciones).
- Para cada fase: hipótesis a validar y cómo la medimos.

## 7. Métricas de producto
- Activación (definición exacta del momento "aha"), retención D1/D7/D30, hábitos completados por usuario activo, movimientos registrados por semana, porcentaje de usuarios que usan ambos dominios, tasa de instalación de la PWA, uso de notificaciones.
- Eventos de analítica a instrumentar (nombre, cuándo se dispara, propiedades).

## 8. Modelo de datos conceptual
- Entidades y relaciones (Usuario, Tarea, Lista, Hábito, RegistroDeHábito, Rutina, Cuenta, Movimiento, Categoría, Presupuesto, Tarjeta, Suscripción, Meta, Deuda, Notificación, etc.) con atributos principales y cardinalidades.
- Diagrama mermaid erDiagram.
- Reglas de integridad relevantes (ej.: un movimiento pertenece a una sola cuenta; una cuota de tarjeta genera una tarea vinculada; borrar una categoría reasigna movimientos).
Sin decisiones de tecnología (sin SQL, sin frameworks).

## 9. Riesgos y consideraciones
- Privacidad y seguridad de datos financieros (bloqueo con PIN/biometría, qué nunca se envía a terceros, exportación y borrado de cuenta).
- Offline y sincronización en PWA: qué funciona sin conexión y cómo se resuelven conflictos.
- Moneda, formatos y feriados de Perú; soporte de dólares.
- Riesgo de "app pesada": cómo evitamos que la suma de dos dominios se sienta compleja.
- Accesibilidad (contraste, tamaños táctiles, lectores de pantalla).
- Supuestos abiertos y cómo validarlos con usuarios reales (guion de 5 entrevistas).

## 10. Backlog inicial listo para Cursor
- Épicas ordenadas por fase, cada una con sus historias de usuario (referenciando la sección 3), criterios de aceptación y dependencias.
- Para cada épica del MVP, un bloque de prompt breve y autocontenido que yo pueda pegar en Cursor para implementarla, indicando qué pantallas, reglas y estados cubre y qué sección del manual de marca y de esta especificación debe leer la IA antes de programar.

# FORMATO DE SALIDA

- Todo en español, en Markdown, con encabezados numerados como arriba. Tablas para MoSCoW, métricas, inventario de pantallas y entidades. Mermaid para módulos, flujos, navegación y modelo de datos.
- Usa el vocabulario del glosario del manual de marca y el tono de voz definido ahí en todo microcopy de ejemplo.
- Sé concreto: cada historia tiene criterios de aceptación; cada regla de negocio tiene un ejemplo numérico en soles; cada pantalla dice qué componentes de la referencia estructural usa.
- Si estás en Cursor, guarda el resultado en `docs/producto/especificacion.md` y el backlog también por separado en `docs/producto/backlog.md`.
- Termina con una lista de 3 decisiones de producto que recomiendas que yo valide antes de empezar a programar.
```

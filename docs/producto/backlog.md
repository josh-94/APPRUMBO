# Backlog inicial de RUMBO

Fuente: [`especificacion.md`](./especificacion.md). Vocabulario: manual de marca §4.5.

Las épicas del MVP están ordenadas para pegarse en Cursor de arriba a abajo. Cada prompt asume el repo abierto y pide leer archivos antes de tocar código.

---

## Épicas por fase

### MVP

| ID | Épica | Historias | Dependencias |
| --- | --- | --- | --- |
| E0 | Tokens y cascarón visual | — (fundación) | Manual §5–6, `docs/marca/tokens.css` |
| E1 | Hoy redibujado | H-HOY-1 a H-HOY-4 | E0; tareas actuales |
| E2 | Hojas de captura (tarea + gasto) | H-TAR-1, H-TAR-4, H-MOV-1, atajos 3 toques | E0 |
| E3 | Hábitos N de 7 | H-HAB-1 a H-HAB-3 | E1 |
| E4 | Plata mínima (movimientos + disponible) | H-MOV-1 a H-MOV-3 (USD opcional si sale barato; si no, solo PEN), H-CUE-1 | E2 |
| E5 | Offline cola de sync | H-TAR-2, H-MOV-2, H-HOY estados sin señal | E2, E3, E4 |
| E6 | Cuenta: avisos, exportar, borrar | H-CUE-1, H-CUE-3, H-CUE-4 (sin PIN) | E4 |
| E7 | Analítica de eventos (sin montos) | §7 | E1–E4 |

### v1

| ID | Épica | Historias | Dependencias |
| --- | --- | --- | --- |
| E8 | Presupuestos por categoría | H-PRE-1 | E4 |
| E9 | Tarjetas → tarea de pago | H-TARJ-1 | E2, E4 |
| E10 | Suscripciones | H-SUS-1 | E9 |
| E11 | Metas con anillo | H-MET-1 | E4 |
| E12 | Deudas debo / me deben | H-DEU-1 | E4 |
| E13 | Transferencias y USD | H-MOV-3, H-MOV-4 | E4 |
| E14 | Insights semanal | H-INS-1, H-INS-2 | E3, E4 |
| E15 | Rutinas | H-RUT-1 | E3 |
| E16 | PIN / biometría | H-CUE-2 | E6 |

### v2

| ID | Épica | Historias |
| --- | --- | --- |
| E17 | Calendario 14x7 | H-AGE-2 |
| E18 | Importar movimiento (texto/foto) | — |
| E19 | Widget de gasto | — |
| E20 | Meta compartida / pareja | — |
| E21 | Trabajo vs personal (Camila) | — |

---

## Prompts de implementación (solo MVP)

Copia un bloque por chat. No implementes v1 en el mismo hilo.

### E0 — Tokens y cascarón

```text
Lee primero:
- docs/marca/manual-de-marca.md (secciones 5 y 6)
- docs/marca/tokens.css
- docs/producto/especificacion.md (principios P1–P8, sección 5.1 tab bar)
- apps/web/src/styles.css
- apps/web/src/components/Shell.tsx

Tarea: importa tokens.css en la web actual. Reemplaza la paleta papel/ Palatino / teal #0e6e68 por variables --rumbo-*. Tab bar flotante oscura (Noche Bosque), pestaña activa en píldora Verde Impulso con texto (nunca texto blanco sobre menta). Radio tarjeta 20 px, píldora 999 px. No agregues módulos nuevos. No toques la API. Verifica en el navegador Hoy, Semana, Listas y Ajustes: contraste AA, una sola tarjeta oscura si aparece.
```

### E1 — Hoy redibujado

```text
Lee primero:
- docs/marca/manual-de-marca.md (§4.3–4.5 microcopy y glosario)
- docs/producto/especificacion.md (§3.1, §5.4 wireframe Hoy)
- apps/web/src/screens/MyDay.tsx
- apps/web/src/screens/Week.tsx

Tarea: convierte la pantalla actual de tareas del día en Hoy. Cabecera: píldora "Hola, {nombre}" + píldora de fecha. Titular de dos tonos según reglas §3.1 (prioridad: vence hoy → tareas + disponible → "Todo listo, / no tienes nada pendiente"). Grid de 3 accesos (Anotar gasto, Nueva tarea, Hábitos) aunque gasto/hábito aún abran un placeholder. Chips de semana (lun–vie). Carrusel Para ti opcional con una tarjeta cerrable. Vacío: "Nada pendiente por ahora. Agrega algo o disfruta el día." No implementes la lógica de Plata todavía: si no hay disponible, el titular habla solo de tiempo. Verifica el flujo en el navegador.
```

### E2 — Hojas de captura

```text
Lee primero:
- docs/producto/especificacion.md (§3.2 H-TAR-1/4, §3.6 atajos 3 toques, §4.2)
- docs/marca/manual-de-marca.md (§4.4 confirmaciones)
- apps/web/src/components/TaskSheet.tsx

Tarea: la creación/edición de tarea sigue en bottom sheet (nunca página). Añade hoja Anotar gasto: teclado de monto, chips de últimos montos (pueden ser fijos 12 / 18.50 / 25 al inicio), categoría sugerida, cuenta Billetera por defecto, CTA Listo. Default = gasto; ingreso es un switch en la misma hoja. Copy de éxito según manual. Persistencia: si Plata aún no tiene API, guarda movimientos en el cliente de forma explícita y documenta el contrato para E4. p75 objetivo: 3 toques desde Hoy. Verifica crear tarea con hora y un gasto en el navegador.
```

### E3 — Hábitos N de 7

```text
Lee primero:
- docs/producto/especificacion.md (§3.4, §4.3)
- docs/marca/manual-de-marca.md (valor "Avance, no perfección", microcopy de hábito)

Tarea: hábitos simples. Alta por hoja: nombre + N de 7 (default 5). Check del día en Hoy y en Tiempo. Racha = semanas cumplidas, no días seguidos. Fallar un día no resetea la racha de semanas. Copy: "Hecho. Gimnasio 3 de 4 esta semana." / "Esta semana no se cerró. La próxima cuenta igual." Máximo 7 hábitos. Sin rutinas, sin 14x7, sin impacto económico. Verifica marcar/desmarcar hoy y no permitir el futuro.
```

### E4 — Plata mínima

```text
Lee primero:
- docs/producto/especificacion.md (§3.6, §3.1 regla de disponible, decisión 1 del final)
- docs/marca/manual-de-marca.md (glosario: movimiento, gasto, ingreso, plata)

Tarea: pantalla Plata y bloque en Hoy. Movimientos gasto/ingreso en S/. Disponible: implementa la alternativa honesta de la spec: si no hay ingreso del mes, muestra "Llevas S/ X gastados", no un "te quedan" inventado. Si hay ingreso, disponible = ingresos − gastos. Lista: gastos en Tinta con "−", ingresos en Verde Rumbo con "+". Vacío: "Aún no registras nada este mes. Empieza con lo último que gastaste." Una o dos cuentas (Billetera, Banco). Sin presupuestos, tarjetas, metas ni deudas. Verifica Hoy + Plata con 2 gastos y 1 ingreso.
```

### E5 — Offline

```text
Lee primero:
- docs/producto/especificacion.md (§3.1 estados, §8 EventoLocal, §9 offline)
- apps/web/src/sw.ts
- apps/web/src/api.ts

Tarea: cola local para crear/editar/check de tarea, hábito y movimiento. Badge "Sin señal" en la píldora de fecha. Copy de error: "No pudimos guardar. Lo intentamos de nuevo cuando vuelva la señal; no pierdes nada." Conflicto: gana el último updated_at del cliente. Simula offline en DevTools y verifica que un gasto y un check no se pierden.
```

### E6 — Cuenta

```text
Lee primero:
- docs/producto/especificacion.md (§3.11, §5.4 wireframe Cuenta)
- docs/marca/manual-de-marca.md (valor "Tu información es tuya")
- apps/web/src/screens/Settings.tsx

Tarea: redibuja Ajustes como Cuenta: avatar, nombre, badges (S/, Sin anuncios), grid Editar / Avisos / Exportar. Avisos: toggles y tope 2/día. Exportar datos (tareas, hábitos, movimientos) a un archivo simple. Borrar cuenta con confirmación escribiendo "borrar". Sin PIN (v1). Verifica exportar y los toggles en el navegador.
```

### E7 — Analítica

```text
Lee primero:
- docs/producto/especificacion.md (§7 tabla de eventos)

Tarea: instrumenta solo los eventos del MVP (session_start, signup_ok, task_saved, task_done, habit_*, movement_saved, available_viewed, pwa_installed). Cero montos, cero títulos de tareas. Documenta dónde queda el cliente de analítica. No agregues producto nuevo.
```

---

## Criterios de aceptación transversales (toda épica MVP)

- Español, tuteo, glosario del manual. Palabras prohibidas: productividad, egreso, streak, dashboard, "perdiste".
- Bottom sheets para crear/editar. No formularios de página para acciones frecuentes.
- Una tarjeta Noche Bosque por pantalla.
- Verificar en el navegador el flujo que tocaste, no solo un screenshot.
- Si una épica pide "fix + exploit/PoC", entrega solo el fix.

# Prompt 1b — Identidad visual de Rumbo en Glyph

## Cómo usar este prompt

1. Entra a [glyph.software](https://glyph.software/) y pega el bloque completo de abajo en el campo de descripción de la marca.
2. El plan gratuito permite solo 2 generaciones y no deja descargar. Úsalas así: la primera con este prompt; la segunda solo para corregir lo que no haya respetado.
3. Revisa que la paleta y las fuentes sean exactamente las del bloque. Si Glyph cambió algo, corrígelo en su editor antes de pagar.
4. Para descargar los SVG, el brand book y los tokens necesitas el plan de pago (US$ 19/mes o US$ 99 único, precios de octubre 2026).
5. Si Glyph exporta tokens CSS, no reemplaces `docs/marca/tokens.css`: compáralos y quédate con los del repo.

Está en inglés porque estas herramientas siguen mejor las instrucciones visuales en inglés. Los textos de la marca van entre comillas en español y deben quedar así.

---

## PROMPT (copiar desde aquí)

```text
BRAND: Rumbo
Category: mobile app (installable PWA, mobile-first) — personal organization + personal finance in one app.
Market: Peru first, then Latin America. All brand copy is in Spanish (informal "tú").

IMPORTANT: The brand strategy, palette, typography and logo concept are ALREADY DEFINED. Do not invent a different palette, fonts or logo concept. Execute exactly what is specified below and only fill in details that are not specified.

--- WHAT IT IS ---
Rumbo combines tasks, habits/routines, agenda and personal finance (expenses, income, credit cards, subscriptions, savings goals, debts) in a single daily overview. Expenses are logged manually in under 5 seconds and the app works offline.
Promise: take control of your time and your money without spending time you don't have.

--- AUDIENCE ---
Busy young professionals aged 25–35 in Peru: office workers, field workers (mining, sales, logistics, health) and freelancers. Their problem is lack of time. They abandoned productivity and finance apps because they were too complex, cold or demanded too much discipline. They don't want to "be more productive"; they want to feel in control and moving forward.

--- POSITIONING ---
"The glance that gives you back control." One screen answers both "how is my day going?" and "how is my money going?" in 10 seconds, with progress shown without guilt.
Tagline (use exactly): "Tu día y tu plata, con rumbo."
Secondary headline: "Pocos minutos, todo en orden."

--- PERSONALITY ---
Archetype: The Guide (practical sage) + The Friend (everyperson).
We are: clear, warm, calm, practical, optimistic.
We are NOT: technical, childish, preachy, corporate-cold, bank-like.
Voice: direct, informal Spanish, no financial or productivity jargon, subtle humor only when nothing is wrong, never guilt.

--- LOGO (concept is decided) ---
Symbol "the needle": a slim compass needle shaped like an elongated rhombus (about 1:3), rotated 45 degrees pointing to the upper right (north-east = moving forward). Split lengthwise into two facets: upper-left Terracota Rumbo #C2461F, lower-right Terracota Profunda #9E3714. A small Arena Dorada #F4B860 circle at the center as the pivot. Meaning: the two halves (your time and your money) form one direction.
- Geometric, flat, no gradients, no shadows, no bevels, no outlines, no compass ring around it.
Wordmark: "rumbo" in lowercase only, friendly geometric grotesque in the style of Bricolage Grotesque ExtraBold, letter spacing -3%, color Tinta #231D1F (white on dark).
Required versions:
1. Primary horizontal (needle left + wordmark, needle tip rising above the letters)
2. Stacked (needle above wordmark)
3. Symbol only
4. App icon: needle on a rounded square of Noche #1F1A1C (radius ~22%), needle spanning 62% of the diagonal
5. Monochrome black and monochrome white (facets separated by a thin gap, pivot cut out)
6. On dark background #1F1A1C (needle in its colors, white wordmark)
7. Simplified version legible at 48 px and 16 px (favicon), without the pivot dot
Clear space: equal to the needle's maximum width on all sides.

--- COLOR SYSTEM (use these exact hex values) ---
Brand:
- Primary — Terracota Rumbo #C2461F (primary buttons, links, active icons). Hover #A93D1A. Deep #9E3714. Soft #FBE4DA.
- Secondary — Arena Dorada #F4B860 (progress: active tab pill, progress ring, streaks, completed habit). Soft #FDF1DC. Text on it is always #231D1F, never white.
Semantic:
- Income — Verde Cosecha #13854F (soft #DDF3E7)
- Expense — Ciruela #8E3A9E (soft #F1E2F4), used in charts and categories; expense amounts in lists use ink color with a minus sign
- Alert / budget exceeded — Granate Alto #B0122F (soft #FBE3E6), always with an alert icon
- Success / habit done — Arena #F4B860 fill, text variant Ocre Logro #8F5F00
- Info — Celeste Info #0A74A6 (soft #DCEFF8)
Neutrals:
- Background — Lino #FAF6F2 (warm off-white)
- Card surface — Papel #FFFFFF
- Dark emphasis card and tab bar — Noche #1F1A1C (warm near-black)
- Ink — Tinta #231D1F
- Secondary ink — Pizarra #6B6062
- Muted headline ink (only ≥24 px) — Niebla #8E8385
- Text on dark — Luna #BDB2AF
- Border / progress track — Línea #EDE5DF
- Disabled — #C4BAB5 on #F1ECE8
Dark mode:
- Background #151112, surface #201A1B, emphasis card #2E2627, ink #F5EFEB, secondary ink #BDB2AF, border #3A3132
- Primary #F0784F, secondary #F6C27A, income #3DD68C, expense #C98BE0, alert #FF6B7A, info #4FB8F0
Usage: 60% background and white cards, 30% ink and the dark card/tab bar, 10% terracotta + sand. One terracotta primary button per screen. Terracotta never signals errors. Never use mint or teal greens, blues or purples as brand colors; never use red for normal expenses.

--- TYPOGRAPHY (Google Fonts, use exactly these) ---
- Headings: Bricolage Grotesque, weights 700 and 800, letter spacing -0.03em
- Body, UI and all money amounts: Inter, weights 400–700, tabular figures (tnum) for amounts
Scale: display 40 px (hero amounts, Inter 700) / h1 30 px (800) / h2 24 px (700) / h3 19 px (700) / body 15 px / small 13.5 px / label 11.5 px uppercase, bold, tracking +0.08em.
Two-tone headline pattern: first line regular weight in Niebla #8E8385, second line ExtraBold in Tinta #231D1F. Example: "Todo en orden, / te quedan S/ 640".
Money format: "S/ 1,250.00" (Peruvian soles), "US$ 320.00" for dollars; income "+ S/ 2,500.00" in green.

--- SHAPES, ICONS, MOTION ---
- Card radius 20 px; pill/button radius 999 px; secondary radii 10/12/14/18 px
- Very soft shadows: 0 1px 2px rgba(35,29,31,.06); 0 2px 6px rgba(35,29,31,.05) + 0 14px 30px -16px rgba(35,29,31,.18)
- Spacing base 4/8 px, screen side padding 20 px, 16 px between cards
- Icons: Tabler Icons, outline, stroke 1.75 px
- Motion: 120/200/320/600 ms, easing cubic-bezier(0.2,0,0,1); a small bounce only on habit check

--- UI PATTERNS FOR MOCKUPS ---
Show the app screens with this structure:
- Header: white pill with avatar + "Hola, Valeria" on the left, white pill with date "Dom. 4 oct." on the right
- Two-tone big headline
- Horizontal carousel of editorial cards with photo background and tag ("Recuerda", "Tip")
- Grid of 3 quick-access white cards with icon inside a soft-colored circle: "Anotar gasto", "Nueva tarea", "Metas"
- One dark summary card (#1F1A1C) per screen: sand uppercase label "TU MES", white title "Te quedan S/ 640", muted subtitle "Hasta el 31 de oct. · 9 días", sand #F4B860 progress ring on the right
- Week as a row of 7 chips (day, number, status like "3/4" or "Listo"), completed chips in terracotta soft #FBE4DA with #9E3714 text
- Linear progress bar: label left "Gastado en Comida", value right "S/ 312 de 600"
- Floating dark rounded tab bar (#1F1A1C) with 4 tabs: Hoy, Tiempo, Plata, Cuenta. Active tab is a sand #F4B860 pill with dark icon + text; inactive tabs are icons only
- Account screen: soft gradient header (#FBE4DA to #FDF1DC), large circular avatar, name, email, badges in pills

--- IMAGERY ---
Real candid photography of young Peruvians in everyday moments (Lima bus at sunrise, a café in Barranco, a mining camp at dusk, an Arequipa street), golden hour light, terracotta and sand tones, warm brown shadows, dark gradient at the bottom for white text. Empty states: simple line illustrations with the same stroke as the icons, ink color with a single sand accent. No 3D characters, no stock-looking smiles.

--- DELIVERABLES I NEED ---
- Logo system (all 7 versions above) in SVG and PNG
- App icon (1024, 512, 192, 180, 48, 32, 16 px) and maskable version
- Splash screen: dark #1F1A1C background, stacked logo, tagline in #BDB2AF
- Color system light + dark, typography pairing, components
- Social mockups: Instagram post 1080x1350, story 1080x1920, reel cover
- OG image 1200x630: dark background, headline "Tu día y tu plata, con rumbo." with "con rumbo" in sand #F4B860
- Brand guidelines PDF
- Code tokens as CSS variables with prefix --rumbo- and Tailwind config

--- DO NOT ---
- Do not change the hex values or the fonts
- No mint/teal greens, no gradients in the logo, no shadows or bevels on the logo
- No uppercase wordmark ("RUMBO" is wrong in the logo; "rumbo" is correct)
- No white text on the sand color
- No full compass with ring or cardinal letters: only the needle
- No 3D mascots or childish illustrations
```

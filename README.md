# Calendar Countdown

Una pantalla web personal que muestra una **cuenta regresiva en tiempo real** hasta tu próxima reunión o evento de Google Calendar, con los detalles del evento debajo. Pensada para dejarla abierta en un monitor como dashboard de "qué sigue".

---

## Tabla de contenidos

- [Qué hace](#qué-hace)
- [Stack técnico](#stack-técnico)
- [Funcionalidades](#funcionalidades)
  - [Autenticación con Google](#autenticación-con-google)
  - [Cuenta regresiva con cambio de color por urgencia](#cuenta-regresiva-con-cambio-de-color-por-urgencia)
  - ["Sucediendo ahora" con barra de progreso](#sucediendo-ahora-con-barra-de-progreso)
  - [Barra superior: reloj DR + noticias + mini calendario](#barra-superior-reloj-dr--noticias--mini-calendario)
  - [Mini calendario con navegación y feriados](#mini-calendario-con-navegación-y-feriados)
  - [Modal de detalles del día](#modal-de-detalles-del-día)
  - [Modal de detalles del evento](#modal-de-detalles-del-evento)
  - [Tira inferior: próximos eventos (+ linger de eventos recientes)](#tira-inferior-próximos-eventos--linger-de-eventos-recientes)
  - [Crear, editar y eliminar eventos](#crear-editar-y-eliminar-eventos)
  - [Panel de configuración](#panel-de-configuración)
  - [Fondo configurable (luces / color / degradado / imagen / video)](#fondo-configurable-luces--color--degradado--imagen--video)
  - [Feed de noticias (RSS / Atom / JSON Feed)](#feed-de-noticias-rss--atom--json-feed)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Configuración inicial](#configuración-inicial)
  - [1. Google Cloud Console](#1-google-cloud-console)
  - [2. Variables de entorno](#2-variables-de-entorno)
  - [3. Correr en local](#3-correr-en-local)
- [API interna](#api-interna)
- [Decisiones de diseño](#decisiones-de-diseño)
- [Despliegue a Vercel](#despliegue-a-vercel)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Roadmap / contribuciones bienvenidas](#roadmap--contribuciones-bienvenidas)
- [Licencia](#licencia)

---

## Qué hace

- Hace login con tu cuenta de Google con un solo botón.
- Agrega los eventos de **todos** los calendarios a los que estás suscrito.
- Muestra en grande la cuenta regresiva (`HH:MM:SS`) al **siguiente** evento por empezar.
- Si tienes un evento en curso, lo muestra como "Sucediendo ahora" con una **barra de progreso** que se va llenando, sin reemplazar la cuenta regresiva al siguiente.
- Salta automáticamente los eventos que **declinaste** (RSVP "No") y los **cancelados**.
- Incluye eventos de todo el día.
- En la parte superior: hora actual de **Santo Domingo**, un feed de noticias opcional, y un mini calendario navegable.
- Click en un día del mini calendario abre un modal con **todos los eventos y feriados** de ese día.
- Click en un evento (de la tira inferior o del modal del día) abre un modal de **detalles** con descripción, ubicación y link a Google Calendar.
- En la parte inferior: cards con los próximos eventos. Los eventos recién terminados siguen visibles unos minutos (linger configurable).
- Botones para **crear**, **editar** y **eliminar** eventos sin salir de la app.
- **Feriados** detectados automáticamente (Google Holidays + nombres en es/en) y marcados con un puntito ámbar.
- **Panel de configuración** con pestañas para ajustar pantalla, fondo, calendario, noticias y exportar/importar todo como JSON.
- **Fondo personalizable**: luces de servidores animadas, color sólido, degradado, imagen o video propio.
- La cuenta regresiva y el fondo van cambiando de color (blanco → ámbar → naranja → rojo, con pulso al final) según se acerca la hora del evento.

---

## Stack técnico

| Capa            | Tecnología                                                                                |
| --------------- | ----------------------------------------------------------------------------------------- |
| Framework       | **Next.js 16** (App Router, TypeScript)                                                   |
| Auth            | **Auth.js v5** (`next-auth@beta`) con proveedor Google y estrategia JWT (cookie-only)     |
| Calendar API    | **`googleapis`** SDK (servidor)                                                           |
| Estado / fetch  | **SWR** (refresh cada 60 s, refetch en focus y al expirar el evento siguiente)            |
| Estilos         | **Tailwind CSS v4** + variables CSS                                                       |
| Persistencia    | **Cero base de datos**. Tokens en cookies HTTP-only encriptadas (JWE) firmadas con AUTH_SECRET. Configuración del usuario en `localStorage` (cliente). |
| Runtime         | Node.js (Vercel-compatible)                                                               |

---

## Funcionalidades

### Autenticación con Google

- Botón "Iniciar sesión con Google" en la landing (sesión cerrada).
- Flujo OAuth 2.0 estándar — Auth.js maneja todo el round-trip.
- Scope solicitado:
  - `openid email profile`
  - `https://www.googleapis.com/auth/calendar` — lectura **y escritura** de calendarios y eventos.
- `access_type=offline` + `prompt=consent` para que Google devuelva un **refresh token** persistido en la cookie. El access token se renueva automáticamente (con margen de 30 s) llamando a `https://oauth2.googleapis.com/token`.
- Si el refresh falla (token revocado, expirado por 6 meses de inactividad, etc.), la sesión expone `error: "RefreshAccessTokenError"` y la UI pide volver a iniciar sesión.

### Cuenta regresiva con cambio de color por urgencia

La cuenta regresiva no es estática — el color de los dígitos y un sutil tinte radial del fondo cambian según cuánto falta para el evento. Las transiciones entre niveles son suaves (1.2 s de fade); no hay saltos bruscos.

| Tiempo restante  | Dígitos                     | Fondo                                  |
| ---------------- | --------------------------- | -------------------------------------- |
| > 1 h            | Blanco (`#f5f5f5`)          | Sin tinte                              |
| 30 – 60 min      | Ámbar claro (`#fde68a`)     | Tinte ámbar tenue                      |
| 10 – 30 min      | Ámbar (`#fbbf24`)           | Tinte ámbar más visible                |
| 2 – 10 min       | Naranja (`#fb923c`)         | Tinte naranja                          |
| 1 – 2 min        | Rojo (`#ef4444`)            | Tinte rojo                             |
| < 1 min          | Rojo intenso **pulsando**   | Tinte rojo fuerte **pulsando**         |

La función que decide el color vive en `app/page.tsx` (`getUrgency`). Las animaciones (`countdown-pulse`, `urgency-pulse`) están definidas en `app/globals.css`.

El tick de los segundos es puramente local (`setInterval` cada 1000 ms haciendo `setNow(Date.now())`) — **no** hay llamada de red por segundo. Cuando la pestaña pasa a `visibilitychange === "hidden"`, el tick se pausa y al volver se reanuda + dispara un `mutate()` para sincronizar.

### "Sucediendo ahora" con barra de progreso

Si hay un evento **en curso** (la hora actual cae entre su inicio y su fin), aparece un bloque arriba de la cuenta regresiva con:

- Encabezado `SUCEDIENDO AHORA`.
- Título del evento.
- Una **barra de progreso** azul que se va llenando linealmente del inicio al fin del evento (transición CSS de 1 s para que se vea fluida con el tick del reloj).
- A los lados de la barra, la hora de inicio y la hora de fin.

La cuenta regresiva grande sigue mostrando el **siguiente** evento — el "Sucediendo ahora" no la reemplaza, la complementa.

### Barra superior: reloj DR + noticias + mini calendario

La cabecera tiene tres bloques con `justify-between`:

- **Izquierda**: reloj de Santo Domingo (24 h, `HH:MM:SS`) + fecha completa en español.
- **Centro** (opcional): feed de noticias (ver más abajo). Solo aparece si está activado en configuración.
- **Derecha**: mini calendario navegable del mes.

Todos los formatos de fecha usan `America/Santo_Domingo` explícitamente — no la TZ del navegador — para evitar inconsistencias.

### Mini calendario con navegación y feriados

- Cuadrícula del mes con encabezados L-M-M-J-V-S-D.
- Controles arriba: `«` año anterior, `‹` mes anterior, **nombre del mes** (click para volver al mes actual), `›` mes siguiente, `»` año siguiente.
- El día de hoy va en blanco sólido.
- Los días con eventos llevan un puntito **azul** debajo del número.
- Los días con feriados llevan un puntito **ámbar** y el número en ámbar (se puede desactivar en configuración → Calendario).
- Click en cualquier día abre el [modal de detalles del día](#modal-de-detalles-del-día).

### Modal de detalles del día

Al clickear un día del mini calendario, se hace `GET /api/events/day?date=YYYY-MM-DD` y se abre un modal con:

- **Feriados** del día (sección separada, fondo ámbar tenue).
- **Eventos** regulares (hora de inicio – fin a la izquierda + título). Click en un evento abre el [modal de detalles del evento](#modal-de-detalles-del-evento).

Si no hay nada en ese día, muestra "No hay nada en este día." El endpoint consulta una ventana UTC ensanchada (±14 h) para no perder eventos que cruzan medianoche en zonas raras, y luego filtra al día de Santo Domingo.

### Modal de detalles del evento

Click en una card de la tira inferior o en un evento dentro del modal del día abre este modal de **solo lectura** con:

- Calendario al que pertenece.
- Título.
- "Cuándo" (fecha + rango de horas, o "Todo el día").
- Ubicación (link clickable si es URL).
- Reunión (Google Meet u otro `hangoutLink`).
- Descripción (preserva saltos de línea).
- Link "Abrir en Google Calendar" (cuando hay `htmlLink`).
- Botón **Editar** si tienes permiso de escritura en ese calendario — abre el [modal de edición](#crear-editar-y-eliminar-eventos).

### Tira inferior: próximos eventos (+ linger de eventos recientes)

- Cards horizontales con scroll si no caben todas.
- Máximo configurable (default 8, rango 1–20).
- Cada card muestra: día (número grande) + mes (abreviado), día de la semana + hora (o "todo el día"), y título truncado a dos líneas.
- Las cards en calendarios donde tienes permiso de **escritura** muestran un ícono de lápiz al pasar el mouse → abre el modal de edición.
- Click en cualquier card abre el modal de detalles.
- Los eventos vienen pre-filtrados (declinados y cancelados ya se eliminaron en el server).

**Linger.** Los eventos que terminaron en los últimos N minutos siguen apareciendo a la izquierda de los próximos, con la etiqueta `PASADO` y opacidad reducida. N es configurable entre **1 minuto y 2 horas** (default 5). Útil para no perder de vista la reunión que acaba de terminar mientras te re-centras. Los feriados nunca entran al linger (inundarían la tira).

### Crear, editar y eliminar eventos

En la nav inferior derecha:

```
+ NUEVO EVENTO   |   CONFIGURACIÓN   |   CERRAR SESIÓN
```

"Nuevo evento" abre un modal con form fields:

- **Título** (requerido)
- **Calendario** (dropdown — solo calendarios con `accessRole` de `owner` o `writer`; al editar, el calendario queda fijo porque la API de Google no permite mover eventos entre calendarios con un PATCH)
- **Todo el día** (checkbox — alterna entre `<input type="date">` y `<input type="datetime-local">`)
- **Inicio** y **Fin**
- **Ubicación / enlace**
- **Descripción**

Botones: **Cancelar**, **Crear / Guardar cambios**, y **Eliminar** (solo en modo editar, con `confirm()`).

El modal usa la zona horaria del navegador para construir el ISO datetime con offset (`±HH:MM`). Para eventos all-day, el campo `end.date` se incrementa en 1 día porque Google lo trata como exclusivo (un evento de un solo día tiene `end.date` = día siguiente).

Tras guardar/eliminar, hace `mutate()` de SWR para refrescar la vista inmediatamente.

### Panel de configuración

Click en `CONFIGURACIÓN` en la nav abre un modal con 5 pestañas. Todo se guarda en `localStorage` bajo la clave `calendar-countdown:settings:v2`. Si encuentra una versión `:v1` migra los segundos legacy a minutos.

**Pantalla**
- **Permanencia tras finalizar** — slider 1 min … 2 h. Cuánto tiempo permanecen los eventos terminados en la tira inferior.
- **Máximo de próximos eventos** — slider 1 … 20.

**Fondo**
- Selector de tipo: Luces / Color / Degradado / Imagen / Video.
- Controles específicos según el tipo (ver siguiente sección).

**Calendario**
- **Destacar feriados** (on/off) — controla si los días con feriado aparecen marcados en ámbar en el mini calendario.

**Noticias**
- **Mostrar feed de noticias** (on/off).
- **URL del feed** (RSS, Atom o JSON Feed).
- **Refrescar cada** — slider 1 … 120 min.
- **Ancho del feed** — slider 240 … 960 px.

**JSON**
- Textarea con la configuración completa serializada.
- Botones **Copiar**, **Descargar** (`calendario-settings.json`) y **Aplicar JSON** para pegar otra configuración. Útil para sincronizar entre dispositivos sin backend.

Abajo del modal: **Restablecer valores** (con `confirm()`) → vuelve a los defaults.

### Fondo configurable (luces / color / degradado / imagen / video)

El componente `Background` cambia lo que renderiza según `settings.background.type`. Encima del fondo siempre hay otra capa (`-z-[5]`) con el **tinte de urgencia** descrito arriba.

- **Luces** (default) — el `ServerLights` original: 180 LEDs distribuidos pseudo-aleatoriamente (seed determinista `mulberry32` para que SSR/hidratación coincidan), 50 % verde, 22 % ámbar, 18 % azul, 5 % rojo, 5 % violeta. Cada LED parpadea con `animation-delay` y `animation-duration` aleatorios. Encima, rayas verticales sutiles tipo racks + scanline horizontal CRT.
- **Color** — color sólido. Picker de color + input hex.
- **Degradado** — `linear-gradient` con dos colores y ángulo (0–360°).
- **Imagen** — subes un archivo de hasta **4 MB** que se guarda como `data:` URL en `localStorage`. Controles de **blur** (0–40 px) y **opacidad** (0–100 %). Encima, un degradado radial oscuro para garantizar contraste con el texto.
- **Video** — subes un archivo de hasta **16 MB** o pegas una URL `.mp4`/`.webm` directa. Reproduce en `autoplay loop playsInline`. Controles de blur, opacidad y mute.

Los límites (4 MB / 16 MB) son por `localStorage`, no por procesamiento — la cuota típica de un origin es ~5–10 MB.

### Feed de noticias (RSS / Atom / JSON Feed)

Si está activado, aparece una columna entre el reloj y el mini calendario con cards horizontales:

- **Encabezado**: `NOTICIAS`.
- Cada card: fecha relativa ("hace 2 horas") o nombre del feed + título a 3 líneas, hasta 8 cards.
- Click en una card abre el link original en pestaña nueva.

**Cómo funciona el fetching.** El navegador casi nunca puede hacer `fetch` directo a un RSS por CORS. La app expone `/api/news?url=...` que actúa como **proxy del lado del servidor**: descarga el feed, parsea XML (RSS/Atom) o JSON Feed, y devuelve una lista normalizada `{id, title, link?, summary?, source?, pubMs?}`. Timeout de 10 s, máximo 20 ítems, sin cache.

El refresh es por `SWR` con `refreshInterval` configurable en minutos.

---

## Estructura del proyecto

```
calendario/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts     # Handlers GET/POST de Auth.js
│   │   ├── events/
│   │   │   ├── route.ts                    # GET (listar con linger), POST (crear)
│   │   │   ├── [eventId]/route.ts          # PATCH (editar), DELETE
│   │   │   └── day/route.ts                # GET eventos+feriados de un día
│   │   └── news/route.ts                   # Proxy RSS/Atom/JSON Feed
│   ├── components/
│   │   ├── Background.tsx                  # Switch del fondo según settings
│   │   ├── ServerLights.tsx                # Fondo "luces" animado
│   │   ├── Dashboard.tsx                   # Reloj DR, MiniCalendar, UpcomingEvents
│   │   ├── EventModal.tsx                  # Modal crear/editar/eliminar
│   │   ├── EventDetailsModal.tsx           # Modal solo-lectura de un evento
│   │   ├── DayDetailsModal.tsx             # Modal con eventos+feriados de un día
│   │   ├── SettingsModal.tsx               # Modal de configuración (5 pestañas)
│   │   └── NewsFeed.tsx                    # Tira de cards de noticias
│   ├── globals.css                         # Tailwind + keyframes de urgencia
│   ├── layout.tsx                          # SessionProvider, fuentes
│   ├── page.tsx                            # Página principal (cliente)
│   └── providers.tsx                       # SessionProvider de NextAuth
├── lib/
│   ├── event-utils.ts                      # Tipos, parsing TZ, filtrado, picker, feriados
│   ├── news-types.ts                       # Tipos del feed de noticias
│   └── settings.ts                         # Hook useSettings + persistencia + migración
├── types/
│   └── next-auth.d.ts                      # Extensión de tipos de Session/JWT
├── auth.ts                                 # Config de Auth.js (Google + refresh)
├── .env.local                              # Secrets locales (NO commitear)
├── .env.local.example                      # Template
└── README.md
```

---

## Configuración inicial

### 1. Google Cloud Console

1. Ir a https://console.cloud.google.com/ y crear un proyecto (ej. `calendar-countdown`).
2. **APIs & Services → Library → Google Calendar API → Enable.**
3. **OAuth consent screen**:
   - User type: **External**
   - App name: `Calendar Countdown`, support email: tu email.
   - **Scopes**: añadir `userinfo.email`, `userinfo.profile`, y `https://www.googleapis.com/auth/calendar` (lectura + escritura).
   - **Test users**: añadir tu propio email. **Crítico** mientras la app esté en modo "Testing" — sin esto, Google devuelve `Error 403: access_denied`.
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** (debe coincidir exactamente):
     - `http://localhost:3000/api/auth/callback/google`
     - (opcional, en producción) `https://tu-dominio.vercel.app/api/auth/callback/google`
5. Copiar **Client ID** y **Client Secret**.

### 2. Variables de entorno

Crea `.env.local` en la raíz (ver `.env.local.example`):

```env
AUTH_SECRET=<random base64 — ej. node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
AUTH_URL=http://localhost:3000

AUTH_GOOGLE_ID=<Client ID de Google Cloud Console>
AUTH_GOOGLE_SECRET=<Client Secret de Google Cloud Console>

# Solo para producción detrás de proxy (Vercel):
# AUTH_TRUST_HOST=true
```

### 3. Correr en local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000), clic en **Iniciar sesión con Google**, acepta los permisos. La cuenta regresiva debería aparecer (o "No hay próximos eventos" si no tienes nada en los próximos 7 días).

---

## API interna

Todas las rutas viven bajo `/api/`. Las de eventos requieren sesión activa (cookie de Auth.js); responden `401` si no. `/api/news` es público (es solo un proxy de URLs públicas).

| Método  | Ruta                                          | Cuerpo / query                                                  | Devuelve                                                                |
| ------- | --------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET`   | `/api/events?lingerMinutes=N`                 | `lingerMinutes` (0–120, opcional)                                | `{ current, next, past, upcoming, writableCalendars, nowMs }`           |
| `POST`  | `/api/events`                                 | `{ calendarId, title, isAllDay, startISO, endISO, location?, description?, timeZone? }` | `{ id, htmlLink }` (201)                                |
| `PATCH` | `/api/events/[eventId]`                       | mismos campos opcionales que POST + `calendarId` requerido       | `{ id }`                                                                |
| `DELETE`| `/api/events/[eventId]?calendarId=...`        | —                                                                | `{ ok: true }`                                                          |
| `GET`   | `/api/events/day?date=YYYY-MM-DD`             | `date` (requerida)                                               | `{ date, events: CalendarEventPayload[] }` (filtrado a TZ Santo Domingo)|
| `GET`   | `/api/news?url=<feed-url>`                    | `url` http(s) (requerida)                                        | `{ items: NewsItem[], fetchedAt }` (RSS/Atom/JSON Feed normalizado)     |
| `GET`   | `/api/auth/*` (Auth.js)                       | manejado por Auth.js (`signin`, `callback`, `session`, `csrf`, etc.) |                                                                     |

El payload de un evento (`CalendarEventPayload`):

```ts
{
  id: string;
  calendarId: string;
  calendarName?: string;
  title: string;
  startMs: number;     // epoch ms ya convertido a UTC
  endMs: number;
  isAllDay: boolean;
  location?: string;
  description?: string;
  hangoutLink?: string;
  htmlLink?: string;
  timeZone?: string;
  canEdit?: boolean;   // true si soy owner/writer del calendario
  isHoliday?: boolean; // true si viene de un calendario de feriados
}
```

El item de noticia (`NewsItem`):

```ts
{
  id: string;
  title: string;
  link?: string;
  summary?: string;
  source?: string;
  pubMs?: number;      // epoch ms si el feed traía fecha
}
```

---

## Decisiones de diseño

- **Sin base de datos**. Toda la sesión vive en una cookie JWE encriptada con `AUTH_SECRET`. Cabe holgado en los 4 KB de límite de cookie. La configuración del usuario vive en `localStorage` (por dispositivo) — si quieres llevarla a otro browser usas la pestaña JSON del modal.
- **Polling 60 s + tick local 1 s**. No abrimos webhooks de Google Calendar (requerirían un endpoint HTTPS público + renovación cada 30 días). La latencia de "vi un cambio en Google Calendar a aparece en la app" es como máximo 1 minuto, suficiente para este caso de uso.
- **Pausa cuando la pestaña está oculta**. Tanto el `setInterval` del tick local como SWR pausan; al volver a la pestaña, hace refetch inmediato.
- **Mejor recargar el "next" cuando vence**. Cuando la cuenta regresiva llega a cero, `mutate()` se dispara una vez (con guard de 5 s para evitar tormentas) para pasar al siguiente evento.
- **All-day events tienen TZ resbalosa**. Google devuelve `start.date` = "YYYY-MM-DD" sin zona horaria. Lo interpretamos como midnight en la zona del calendario que lo contiene (`calendarList.timeZone`) — esto evita que un evento "lunes" aparezca como sábado al cambiar de zona.
- **Match por `self === true`, no por email**. Para detectar tu propio RSVP en `attendees`, comparamos contra la flag `self` que Google pone — esto maneja aliases, delegación y cuentas con múltiples emails.
- **Filtros server-side**. Los cancelados y declinados se quitan antes de salir del backend; el cliente no necesita conocer esa lógica.
- **Detección de feriados sin lista hardcoded**. `isHolidayCalendar()` reconoce los calendarios públicos de Google (`*#holiday@group.v.calendar.google.com`) y nombres que contengan "holiday", "festivo" o "feriado". Así funciona con cualquier país que el usuario tenga suscrito.
- **Linger fuera de los feriados**. Los feriados nunca entran al bucket "pasado" del linger porque inundarían la tira un martes cualquiera con todos los del año en curso.
- **Proxy de noticias en el server**. RSS/Atom raramente sirven CORS abierto. El endpoint `/api/news` descarga y normaliza en el servidor; el cliente solo ve JSON. Timeout de 10 s y `Cache-Control: no-store` (el cache real lo hace SWR en el cliente).
- **Imágenes/videos de fondo en `localStorage`**. Subir un archivo lo convierte a `data:` URL y se guarda local — cero red, cero servidor. Por eso los límites (4 MB imagen / 16 MB video) — más arriba el `localStorage` peta.
- **Migración de settings**. El schema arrancó como `v1` (linger en segundos) y mutó a `v2` (linger en minutos + background + news). `loadSettings()` migra una vez y reescribe bajo la clave nueva.
- **`useMemo` siempre en el mismo orden**. Cuidado al añadir hooks: la página tiene `if (status === "loading")` y `if (!hasSession)` returns, así que **todos** los hooks deben llamarse antes de cualquier branch condicional.

---

## Despliegue a Vercel

1. Push del repo a GitHub.
2. Importar el proyecto en Vercel.
3. En Vercel → Settings → Environment Variables:
   - `AUTH_SECRET` — el mismo del .env local
   - `AUTH_URL` — `https://tu-dominio.vercel.app`
   - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - `AUTH_TRUST_HOST=true` (Vercel está detrás de proxy)
4. En Google Cloud Console → OAuth Client → añadir el redirect URI de producción:
   `https://tu-dominio.vercel.app/api/auth/callback/google`
5. Deploy.

---

## Limitaciones conocidas

- **App en modo "Testing"**. Mientras no pases la verificación de Google, **solo los emails listados como Test Users** pueden iniciar sesión. Para una app de uso personal está bien — agregar Test User toma 5 segundos. Si quieres compartirla, hay que pasar el proceso de verification de Google (semanas, video del flujo, política de privacidad, etc.).
- **Apple Watch / smartwatches**. watchOS no tiene navegador. La app web **no corre** en el reloj. Para llevarla al Apple Watch hay que reescribir la UI en SwiftUI (el backend de `/api/events` se reutilizaría). Alternativa rápida: un Shortcut de iOS que consulte la API y se muestre como complicación.
- **Reloj del cliente desincronizado**. La cuenta regresiva usa `Date.now()` del navegador. Si tu reloj del SO está mal, la cuenta regresiva está mal. Fuera de scope arreglarlo.
- **Refresh token revocado**. Google revoca refresh tokens después de 6 meses de inactividad o si quitas la app desde https://myaccount.google.com/permissions. La UI detecta el error y pide re-login.
- **Mover eventos entre calendarios**. La API de Google no soporta cambiar `calendarId` con un PATCH. El modal de edición deja el calendario en read-only por esa razón.
- **Settings no se sincronizan entre dispositivos**. Viven en `localStorage`. Para llevarlas a otra máquina: pestaña JSON → Copiar → pegar en el otro lado. No hay sync automático porque no hay backend de usuario.
- **Tamaño de imagen/video de fondo**. Limitado a 4 MB / 16 MB por la cuota de `localStorage`. Para videos más grandes hay que servirlos por URL externa y pegar el link.
- **Feeds de noticias muy raros**. El parser cubre RSS 2.0, Atom y JSON Feed v1.1. Feeds con extensiones exóticas (Media RSS, Dublin Core puro, etc.) pueden quedarse con campos vacíos. Si un feed no llega o tarda más de 10 s, el endpoint devuelve `502`.

---

## Roadmap / contribuciones bienvenidas

Ideas pendientes a las que la comunidad puede aportar vía PR. Si quieres trabajar en una, abre un issue antes para evitar duplicar esfuerzo.

### 🔔 Notificaciones de escritorio cuando falte ≤ 1 hora para un evento

**Resumen.** Cuando un evento entra a la ventana de "queda 1 hora o menos", la app debería disparar:

1. Una **notificación del sistema operativo** usando la [Notification Web API](https://developer.mozilla.org/en-US/docs/Web/API/Notification) con `requireInteraction: true` y `tag: eventId` (para que reemplace alertas previas del mismo evento si la hora cambia).
2. Un **banner persistente dentro de la app** (estilo barra roja arriba) que solo se cierra con un botón "Visto". Esto cubre el caso en que el SO descarte la notificación automáticamente (ver tabla más abajo).

**Disparador.** Cuando `next.startMs - Date.now() <= 60 * 60 * 1000` y `eventId` no esté ya en el set de "alertados".

**Persistencia.** Guardar el set de IDs alertados en `localStorage`. Clave por evento: `eventId + ":" + startMs` — así si el organizador cambia la hora del evento, vuelve a alertar.

**UX de permisos.** Un enlace pequeño en la nav inferior ("+ Nuevo evento | Notificaciones | Configuración | Cerrar sesión") que solo aparece si `Notification.permission === "default"`. Al clickear, llama `Notification.requestPermission()`. Esconder el enlace si quedó en "granted" o "denied".

**Limpieza.** Cuando un evento sale del set de `upcoming` del API (pasó o fue cancelado), quitarlo del set de alertados para que `localStorage` no crezca infinitamente.

**Comportamiento por SO** (importante documentar limitación):

| SO              | `requireInteraction: true`                                                  |
| --------------- | --------------------------------------------------------------------------- |
| Windows 11      | Se queda en pantalla hasta cerrar. ✅                                        |
| Windows 10      | \~25 s y luego va al Action Center. ⚠️                                       |
| macOS           | Aparece y baja al Notification Center, el flag se ignora. ❌                 |
| Linux (GNOME)   | Respeta el flag. ✅                                                          |
| Linux (KDE)     | Respeta el flag. ✅                                                          |

Por esto el banner in-app es necesario — no asume que la notificación del SO se quede visible.

**Archivos que tocarías:**
- `app/page.tsx` — lógica del trigger, banner de UI, botón de permiso en la nav.
- Posiblemente un nuevo `app/components/NotificationBanner.tsx` para mantener `page.tsx` legible.

**Criterios de aceptación:**
- [ ] Banner se muestra dentro de la app cuando un evento cruza el umbral de 60 min.
- [ ] Notificación del SO se dispara una sola vez por evento (no en cada tick del segundero).
- [ ] Si la hora del evento cambia, vuelve a disparar.
- [ ] Cerrar el banner no re-dispara la alerta para el mismo evento.
- [ ] Si el usuario niega permisos, el banner in-app sigue funcionando como fallback.
- [ ] No re-alertar al recargar la página para eventos ya descartados.

### Otras ideas abiertas

- **App nativa de Apple Watch (SwiftUI)** que consuma el mismo `/api/events`. Watch face complication con el countdown.
- **Modo "TV"** — ocultar el cursor del mouse después de N segundos y bloquear el sleep del SO (Wake Lock API).
- **Múltiples cuentas de Google** — selector para ver el calendario de varias cuentas a la vez.
- **Soporte para Google Tasks** además de eventos (otra API y scope: `tasks.readonly`).
- **PWA installable** — manifest + service worker para que se pueda instalar como app independiente.
- **Sync de settings entre dispositivos** — opcional, con un backend mínimo (KV de Vercel / Upstash) atado al `sub` del JWT.
- **Múltiples feeds de noticias** — hoy solo se soporta una URL. Permitir varias con peso/orden.
- **Tests** — la lógica de `lib/event-utils.ts` (parsing de TZ, filtrado, picker, detección de feriados) y `lib/settings.ts` (migración v1→v2, deepMerge) son ideales para tests unitarios con Vitest. Hoy no hay ninguna suite.
- **i18n** — la UI mezcla español e inglés. Centralizar strings.

---

## Licencia

[MIT](./LICENSE) — usar, modificar y distribuir libremente con atribución.

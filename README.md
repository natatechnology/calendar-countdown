# Calendar Countdown

Una pantalla web personal que muestra una **cuenta regresiva en tiempo real** hasta tu próxima reunión o evento de Google Calendar, con los detalles del evento debajo. Pensada para dejarla abierta en un monitor como dashboard de "qué sigue".

---

## Tabla de contenidos

- [Qué hace](#qué-hace)
- [Stack técnico](#stack-técnico)
- [Funcionalidades](#funcionalidades)
  - [Autenticación con Google](#autenticación-con-google)
  - [Cuenta regresiva con cambio de color por urgencia](#cuenta-regresiva-con-cambio-de-color-por-urgencia)
  - [Barra superior: reloj DR + mini calendario](#barra-superior-reloj-dr--mini-calendario)
  - [Tira inferior: próximos eventos](#tira-inferior-próximos-eventos)
  - [Crear, editar y eliminar eventos](#crear-editar-y-eliminar-eventos)
  - [Fondo de luces de servidores](#fondo-de-luces-de-servidores)
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
- Si tienes un evento en curso, lo muestra como "Happening now" sin reemplazar la cuenta regresiva.
- Salta automáticamente los eventos que **declinaste** (RSVP "No") y los **cancelados**.
- Incluye eventos de todo el día.
- En la parte superior: hora actual de **Santo Domingo** + mini calendario del mes con el día de hoy resaltado.
- En la parte inferior: cards con los próximos eventos.
- Botones para **crear**, **editar** y **eliminar** eventos sin salir de la app.
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
| Persistencia    | **Cero base de datos**. Tokens en cookies HTTP-only encriptadas (JWE) firmadas con AUTH_SECRET |
| Runtime         | Node.js (Vercel-compatible)                                                               |

---

## Funcionalidades

### Autenticación con Google

- Botón "Sign in with Google" en la landing (sesión cerrada).
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

### Barra superior: reloj DR + mini calendario

- **Reloj de Santo Domingo**: formato 24 h (`HH:MM:SS`) en zona `America/Santo_Domingo`, con la fecha completa en español debajo. Actualiza cada segundo con el mismo tick que la cuenta regresiva.
- **Mini calendario**: cuadrícula del mes actual con encabezados L-M-M-J-V-S-D. El día de hoy va en blanco sólido; los días con eventos en el mes tienen un puntito azul tenue debajo del número. El mes se calcula también en TZ Santo Domingo, no en la TZ del navegador.

### Tira inferior: próximos eventos

- Hasta 8 cards horizontales con scroll si no caben todos.
- Cada card muestra: día (número grande) + mes (abreviado), día de la semana + hora (o "all day"), y título truncado a dos líneas.
- Las cards en calendarios donde tengo permiso de **escritura** muestran un ícono de lápiz al pasar el mouse → abre el modal de edición.
- Los eventos vienen pre-filtrados (declinados y cancelados ya se eliminaron en el server).

### Crear, editar y eliminar eventos

Hay un menú abajo a la derecha con dos enlaces estilo nav:

```
+ NUEVO EVENTO   |   SIGN OUT
```

Ambos abren un modal con form fields:

- **Título** (requerido)
- **Calendario** (dropdown — solo calendarios con `accessRole` de `owner` o `writer`; al editar, el calendario queda fijo porque la API de Google no permite mover eventos entre calendarios con un PATCH)
- **Todo el día** (checkbox — alterna entre `<input type="date">` y `<input type="datetime-local">`)
- **Inicio** y **Fin**
- **Ubicación / enlace**
- **Descripción**

Botones: **Cancelar**, **Crear / Guardar cambios**, y **Eliminar** (solo en modo editar, con `confirm()`).

El modal usa la zona horaria del navegador para construir el ISO datetime con offset (`±HH:MM`). Para eventos all-day, el campo `end.date` se incrementa en 1 día porque Google lo trata como exclusivo (un evento de un solo día tiene `end.date` = día siguiente).

Tras guardar/eliminar, hace `mutate()` de SWR para refrescar la vista inmediatamente.

### Fondo de luces de servidores

Componente `ServerLights` que renderiza:

- **180 puntos LED** distribuidos pseudo-aleatoriamente (con seed determinista `mulberry32` para que SSR e hidratación coincidan).
- Distribución de colores: 50 % verde, 22 % ámbar, 18 % azul, 5 % rojo, 5 % violeta.
- Cada LED parpadea con `animation-delay` y `animation-duration` aleatorios (entre 1.4 s y 4.6 s) para que el patrón se sienta orgánico.
- Encima de los LEDs, dos capas sutiles: rayas verticales sugiriendo columnas de racks y un scanline horizontal tipo CRT (opacidad muy baja).
- Detrás de todo, un gradiente radial oscuro centrado.

Por encima del fondo de servidores hay otra capa (`-z-[5]`) que es el **tinte de urgencia** descrito arriba — esta cambia con la cuenta regresiva.

---

## Estructura del proyecto

```
calendario/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts     # Handlers GET/POST de Auth.js
│   │   └── events/
│   │       ├── route.ts                    # GET (listar), POST (crear)
│   │       └── [eventId]/route.ts          # PATCH (editar), DELETE
│   ├── components/
│   │   ├── ServerLights.tsx                # Fondo animado
│   │   ├── Dashboard.tsx                   # Reloj DR, MiniCalendar, UpcomingEvents
│   │   └── EventModal.tsx                  # Modal crear/editar/eliminar
│   ├── globals.css                         # Tailwind + keyframes de urgencia
│   ├── layout.tsx                          # SessionProvider, fuentes
│   ├── page.tsx                            # Página principal (cliente)
│   └── providers.tsx                       # SessionProvider de NextAuth
├── lib/
│   └── event-utils.ts                      # Tipos, parsing de TZ, filtrado, picker
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

Abre [http://localhost:3000](http://localhost:3000), clic en **Sign in with Google**, acepta los permisos. La cuenta regresiva debería aparecer (o "No upcoming events" si no tienes nada en los próximos 7 días).

---

## API interna

Todas las rutas viven bajo `/api/`. Todas requieren sesión activa (cookie de Auth.js); responden `401` si no.

| Método  | Ruta                                          | Cuerpo / query                                                  | Devuelve                                                       |
| ------- | --------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET`   | `/api/events`                                 | —                                                                | `{ current, next, upcoming, writableCalendars, nowMs }`        |
| `POST`  | `/api/events`                                 | `{ calendarId, title, isAllDay, startISO, endISO, location?, description?, timeZone? }` | `{ id, htmlLink }` (201)                                       |
| `PATCH` | `/api/events/[eventId]`                       | mismos campos opcionales que POST + `calendarId` requerido       | `{ id }`                                                       |
| `DELETE`| `/api/events/[eventId]?calendarId=...`        | —                                                                | `{ ok: true }`                                                 |
| `GET`   | `/api/auth/*` (Auth.js)                       | manejado por Auth.js (`signin`, `callback`, `session`, `csrf`, etc.) |                                                          |

El payload de un evento (`CalendarEventPayload`):

```ts
{
  id: string;
  calendarId: string;
  calendarName?: string;
  title: string;
  startMs: number;   // epoch ms ya convertido a UTC
  endMs: number;
  isAllDay: boolean;
  location?: string;
  description?: string;
  hangoutLink?: string;
  htmlLink?: string;
  timeZone?: string;
  canEdit?: boolean; // true si soy owner/writer del calendario
}
```

---

## Decisiones de diseño

- **Sin base de datos**. Toda la sesión vive en una cookie JWE encriptada con `AUTH_SECRET`. Cabe holgado en los 4 KB de límite de cookie. Si lo despliegas en multiple servidores no hay nada compartido que sincronizar.
- **Polling 60 s + tick local 1 s**. No abrimos webhooks de Google Calendar (requerirían un endpoint HTTPS público + renovación cada 30 días). La latencia de "vi un cambio en Google Calendar a aparece en la app" es como máximo 1 minuto, suficiente para este caso de uso.
- **Pausa cuando la pestaña está oculta**. Tanto el `setInterval` del tick local como SWR pausan; al volver a la pestaña, hace refetch inmediato.
- **Mejor recargar el "next" cuando vence**. Cuando la cuenta regresiva llega a cero, `mutate()` se dispara una vez (con guard de 5 s para evitar tormentas) para pasar al siguiente evento.
- **All-day events tienen TZ resbalosa**. Google devuelve `start.date` = "YYYY-MM-DD" sin zona horaria. Lo interpretamos como midnight en la zona del calendario que lo contiene (`calendarList.timeZone`) — esto evita que un evento "lunes" aparezca como sábado al cambiar de zona.
- **Match por `self === true`, no por email**. Para detectar tu propio RSVP en `attendees`, comparamos contra la flag `self` que Google pone — esto maneja aliases, delegación y cuentas con múltiples emails.
- **Filtros server-side**. Los cancelados y declinados se quitan antes de salir del backend; el cliente no necesita conocer esa lógica.
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

---

## Roadmap / contribuciones bienvenidas

Ideas pendientes a las que la comunidad puede aportar vía PR. Si quieres trabajar en una, abre un issue antes para evitar duplicar esfuerzo.

### 🔔 Notificaciones de escritorio cuando falte ≤ 1 hora para un evento

**Resumen.** Cuando un evento entra a la ventana de "queda 1 hora o menos", la app debería disparar:

1. Una **notificación del sistema operativo** usando la [Notification Web API](https://developer.mozilla.org/en-US/docs/Web/API/Notification) con `requireInteraction: true` y `tag: eventId` (para que reemplace alertas previas del mismo evento si la hora cambia).
2. Un **banner persistente dentro de la app** (estilo barra roja arriba) que solo se cierra con un botón "Visto". Esto cubre el caso en que el SO descarte la notificación automáticamente (ver tabla más abajo).

**Disparador.** Cuando `next.startMs - Date.now() <= 60 * 60 * 1000` y `eventId` no esté ya en el set de "alertados".

**Persistencia.** Guardar el set de IDs alertados en `localStorage`. Clave por evento: `eventId + ":" + startMs` — así si el organizador cambia la hora del evento, vuelve a alertar.

**UX de permisos.** Un enlace pequeño en la nav inferior ("+ Nuevo evento | Notificaciones | Sign out") que solo aparece si `Notification.permission === "default"`. Al clickear, llama `Notification.requestPermission()`. Esconder el enlace si quedó en "granted" o "denied".

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
- **Tests** — la lógica de `lib/event-utils.ts` (parsing de TZ, filtrado, picker) es ideal para tests unitarios con Vitest. Hoy no hay ninguna suite.
- **i18n** — la UI mezcla español e inglés. Centralizar strings.

---

## Licencia

[MIT](./LICENSE) — usar, modificar y distribuir libremente con atribución.

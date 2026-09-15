# QA Job Radar v5

PWA personal para descubrir, priorizar y seguir ofertas de QA/Test, firmware, CPE, telecomunicaciones, redes, dispositivos, IoT y validación de datos.

## Reglas del perfil

- **Jornada completa.** Se descartan ofertas que indiquen jornada parcial, prácticas o freelance puro. Si la publicación no informa la jornada, se conserva con aviso para no perder una oportunidad relevante por falta de metadatos.
- **Salario mínimo: 32.000 EUR brutos/año** cuando existe una cifra publicada. Si la banda cruza el mínimo, la oferta se conserva y se marca para confirmar/negociar.
- **Remoto:** prioridad máxima. Se admiten ofertas internacionales siempre que no indiquen una restricción incompatible con trabajar desde España.
- **Híbrido:** exclusivamente Madrid / Comunidad de Madrid.
- **Presencial:** exclusivamente Madrid / Comunidad de Madrid y solo con match técnico alto.
- Se excluyen prácticas, junior puro, helpdesk, service desk, soporte L1 y perfiles claramente fuera del objetivo.

## Perfil usado para el matching

El scoring da peso específico a la experiencia real del CV:

- QA funcional/manual, regresión, retesting, interoperabilidad, rendimiento, planes/casos de prueba, homologación/certificación, gestión de defectos, HP ALM / Quality Center, evidencias e informes técnicos.
- CPE, routers, STB, firmware, Wi-Fi 2.4/5/6 GHz, Mesh/MLO, GPON/XGS-PON, TR-069/TR-181, ACS/CWMP, GPV/GPN/SPV, TCP/IP, IPv4/IPv6, PPPoE y VPN.
- Linux/CLI, Wireshark, Tcpdump, logs, troubleshooting, Bash, PowerShell y generación de tráfico.
- Azure IoT, Agente Único, OPA-H, Device Twin, telemetría, datablocks y validación/consistencia de datos.
- Automatización de pruebas/procesos, utilidades internas, Docker, SQL/PL-SQL, MySQL/Oracle y administración Linux/Windows.
- Coordinación con cliente y reporting técnico como señales complementarias para puestos con responsabilidad de seguimiento.

## Novedades V5

### Descubrimiento y decisión

- Filtros rápidos: **Todo / Prioritarias / Nuevas / Con salario / Sin bloqueadores**.
- Indicador **Nueva desde tu última visita**.
- Explicación **Por qué aplicar** en cada tarjeta.
- Bloque **A vigilar** con idiomas, salario, experiencia, ubicación y datos no confirmados.
- Desglose del score por rol, skills, experiencia, modalidad, idioma y salario.
- Salario separado entre dato estructurado y cifra detectada en el texto de la oferta.
- Dedupe más fuerte por empresa + similitud semántica del título. Si la misma vacante aparece en varias fuentes, se agrupan sus fuentes.
- Comparador de hasta 4 ofertas.
- Radar de tecnologías demandadas y señal de skills que no aparecen explícitamente en el CV.

### Seguimiento de candidaturas

Estados disponibles:

- Pendiente
- Prioritaria
- Guardada
- Aplicada
- Entrevista
- Rechazada
- Oferta recibida
- Descartada

El botón **“✓ Ya he aplicado”** sigue siendo directo. Una candidatura marcada como aplicada, entrevista, rechazada u oferta recibida no vuelve a Pendientes aunque la misma vacante reaparezca desde otra fuente o URL.

La app conserva una copia local de las ofertas seguidas, por lo que una candidatura puede seguir consultándose aunque ya no esté en el feed actual. En ese caso se muestra **“Fuera del feed actual”**; no se afirma automáticamente que la empresa la haya cerrado.

### Portabilidad y sincronización

- **Exportar datos:** descarga un JSON con estados, histórico y ofertas vistas.
- **Importar copia:** permite mover el seguimiento a otro navegador sin nube.
- **Sincronización PC/móvil opcional:** preparada con Supabase Auth + Row Level Security. La app funciona sin Supabase; al configurarlo, los estados de candidatura se sincronizan con la misma cuenta entre dispositivos.

## Fuentes automáticas

El feed de GitHub Actions agrega y deduplica:

- **Jobicy** — remoto.
- **Himalayas** — remoto y búsqueda internacional; después se filtran restricciones incompatibles con España.
- **Remotive** — remoto; se refresca como máximo cada 6 horas.
- **Arbeitnow** — ofertas europeas/remotas.
- **Selección curada de LinkedIn** — para mejorar especialmente Madrid y puestos de dispositivos/telecom. No se automatizan acciones dentro de LinkedIn.

La app abre la publicación original para aplicar. Si la fuente no es LinkedIn, ofrece además una búsqueda secundaria por puesto + empresa en LinkedIn.


## Arranque rápido en Windows

Si todavía no la has publicado, descomprime el ZIP y ejecuta **`START_APP.bat`**. El script intenta iniciar un servidor local con `py` o `python` y abre `http://localhost:8080` automáticamente.

## Publicar con GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio GitHub en `main`.
2. En GitHub: **Settings > Pages > Build and deployment > Source > GitHub Actions**.
3. Ejecuta **Update jobs and deploy** una vez desde Actions.
4. Abre la URL de GitHub Pages.
5. Instala la PWA desde el navegador en Windows/Android/iOS cuando el navegador lo permita.

El workflow se programa cada hora. Jobicy, Himalayas y Arbeitnow se consultan en cada actualización. Remotive se consulta solo en las franjas de 6 horas y se conserva su último conjunto entre ejecuciones.

## Sincronización opcional con Supabase

La app funciona perfectamente sin este paso. Para sincronizar PC y móvil:

1. Crea un proyecto en Supabase.
2. Ejecuta en el SQL Editor el contenido de `sync/supabase.sql`.
3. En **Authentication**, habilita email/password.
4. Copia la Project URL y la public `anon key`.
5. Edita `sync-config.json`:

```json
{
  "enabled": true,
  "url": "https://TU-PROYECTO.supabase.co",
  "anon_key": "TU_ANON_KEY"
}
```

6. Publica de nuevo la app.
7. Desde **Sincronización**, crea/inicia sesión con la misma cuenta en PC y móvil.

La política RLS incluida permite a cada usuario leer y escribir únicamente su propia fila de seguimiento.

## Uso local

```bash
python -m http.server 8080
```

Después abre `http://localhost:8080`.

Actualizar manualmente el feed:

```bash
python scripts/fetch_jobs.py
```

## Archivos principales

- `index.html` — interfaz PWA.
- `styles.css` — diseño responsive.
- `app.js` — scoring visual, filtros, estados, histórico, comparador, radar y sincronización.
- `config.json` — perfil, reglas, roles y skills.
- `scripts/fetch_jobs.py` — agregación y scoring del feed.
- `data/jobs.json` — feed consumido por la PWA.
- `data/curated_jobs.json` — refuerzo manual/curado de ofertas concretas.
- `.github/workflows/update-and-deploy.yml` — refresco y despliegue automático.
- `sync/supabase.sql` — tabla y políticas de sincronización opcional.

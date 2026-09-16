# QA Job Radar V1.0

Radar de empleo personalizado para QA/Test, firmware, CPE, telecomunicaciones, networking, dispositivos e IoT.

## Reglas de búsqueda

- Jornada completa. Se excluyen prácticas y jornada parcial explícita.
- Salario mínimo: 32.000 EUR brutos/año cuando la cifra está publicada.
- Remoto: únicamente España / compatible explícitamente con trabajar desde España.
- Híbrido: únicamente Madrid / Comunidad de Madrid.
- Presencial: únicamente Madrid / Comunidad de Madrid.
- Remoto, híbrido y presencial tienen el mismo peso en el score.
- Antigüedad máxima: 28 días.
- Solo se muestran ofertas con enlace de candidatura y consideradas activas por su fuente.
- El score no actúa como corte del feed: sirve para ordenar y explicar el encaje.

## Perfil técnico usado por defecto

QA funcional/manual, regresión, retesting, interoperabilidad, rendimiento, homologación/certificación, CPE, routers, STB, firmware, Wi-Fi 2.4/5/6 GHz, Mesh/MLO, GPON/XGS-PON, TR-069/TR-181, ACS/CWMP, GPV/GPN/SPV, TCP/IP, IPv4/IPv6, PPPoE, VPN, Linux/CLI, Wireshark, Tcpdump, troubleshooting, Bash, PowerShell, Azure IoT, Agente Único, OPA-H, Device Twin, telemetría, datablocks, Docker, SQL y automatización.

## Fuentes

El actualizador agrega distintas fuentes públicas. V6.2 añade una fuente employer-direct amplia para España y mantiene Jobicy, Himalayas, Arbeitnow, Remote OK y Remotive cuando la geografía y disponibilidad son compatibles.

Las ofertas estáticas/curadas antiguas no se reutilizan como vacantes activas salvo que incluyan una verificación reciente.

## Estados

- Pendiente
- Prioritaria
- Guardada
- Aplicada
- Entrevista
- Rechazada
- Oferta recibida
- Descartada

`✓ Ya he aplicado` y `Descartar` son acciones directas y persistentes.

## Despliegue

El workflow `Update jobs and deploy` genera `data/jobs.json` y publica la PWA en GitHub Pages. La caché del service worker para esta versión es `V6.2`.

Consulta `UPDATE_GITHUB_V6_2.md` para reemplazar solo los archivos necesarios.


## V6.3 — corrección de feed y caché

- La app ya no se queda en 0 si `data/jobs.json` es antiguo o insuficiente: con menos de 25 ofertas válidas o un feed de más de 3 horas, consulta automáticamente fuentes en vivo.
- Las ofertas deben tener fecha de publicación de 28 días o menos y estado/enlace de candidatura activo.
- Job Opportunities API se consulta directamente desde el navegador como fuente de respaldo; su endpoint público devuelve vacantes live y enlaces directos de candidatura.
- Himalayas se consulta por búsquedas técnicas y España para ampliar el remoto.
- Se elimina de forma defensiva cualquier bloque antiguo `MATCH`/`Comparar` de la cabecera para evitar mezclas de caché entre versiones.


## V6.4 — corrección del 0 ofertas

- Restaura las funciones de renderizado/avisos que se eliminaron accidentalmente en V6.3.
- La fuente principal se consulta directamente al abrir la app cuando el feed está vacío o antiguo.
- Diagnóstico visible por fuente (válidas/raw) si una fuente devuelve 0 o falla.
- Máximo 28 días, vacantes activas y con enlace de aplicación.
- Remoto España; híbrido/presencial Madrid; misma prioridad.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const {
  JIRA_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_PROJECT_KEY,
  FIELD_MONTO,
  FIELD_CATEGORIA
} = process.env;

if (
  !JIRA_URL ||
  !JIRA_EMAIL ||
  !JIRA_API_TOKEN ||
  !JIRA_PROJECT_KEY ||
  !FIELD_MONTO ||
  !FIELD_CATEGORIA
) {
  console.error("Faltan variables de entorno en el archivo .env");
  process.exit(1);
}

const ESTADOS_APROBADOS = [
  "Compra Completada",
  "En Proceso de Adquisición",
  "Aprobada - Pendiente Compra"
];

const ESTADOS_RECHAZADOS = ["Rechazada"];

/**
 * Hace requests a Jira con autenticación Basic
 */
async function jiraRequest(path, params = {}) {
  const url = new URL(`${JIRA_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error Jira ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Consulta todas las solicitudes del proyecto con paginación
 */
async function obtenerSolicitudes() {
  const jql = `project = ${JIRA_PROJECT_KEY} AND issuetype = Solicitud`;
  const issues = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const data = await jiraRequest("/rest/api/3/search/jql", {
      jql,
      startAt,
      maxResults,
      fields: `summary,status,created,resolutiondate,${FIELD_MONTO},${FIELD_CATEGORIA}`
    });

    const pageIssues = data.issues || [];
    issues.push(...pageIssues);

    const total = data.total || 0;
    startAt += pageIssues.length;

    if (startAt >= total || pageIssues.length === 0) {
      break;
    }
  }

  return issues;
}

/**
 * Convierte string ISO a Date segura
 */
function parseJiraDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Obtiene nombre de categoría desde custom field
 */
function getCategoriaValue(categoriaField) {
  if (!categoriaField) return "Sin Categoría";

  // Caso típico select field: { value: "Equipo" }
  if (typeof categoriaField === "object" && categoriaField.value) {
    return categoriaField.value;
  }

  // Si Jira devuelve string directo
  if (typeof categoriaField === "string") {
    return categoriaField;
  }

  return "Sin Categoría";
}

/**
 * Normaliza monto
 */
function getMontoValue(value) {
  if (value === null || value === undefined) return 0;
  const monto = Number(value);
  return Number.isFinite(monto) ? monto : 0;
}

/**
 * Métrica 1: tiempo promedio de completado
 */
function calcularMetricaTiempo(solicitudes) {
  const ahora = new Date();
  const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1, 0, 0, 0, 0));

  const solicitudesCompletadasMes = [];
  const tiempos = [];

  for (const issue of solicitudes) {
    const fields = issue.fields || {};
    const created = parseJiraDate(fields.created);
    const resolutiondate = parseJiraDate(fields.resolutiondate);

    if (!created || !resolutiondate) continue;

    if (resolutiondate >= inicioMes) {
      const dias = (resolutiondate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

      solicitudesCompletadasMes.push({
        key: issue.key,
        dias: Number(dias.toFixed(2)),
        estado: fields.status?.name || "Sin estado"
      });

      tiempos.push(dias);
    }
  }

  if (tiempos.length === 0) {
    return {
      promedio: 0,
      min: 0,
      max: 0,
      totalCompletadasMes: 0,
      solicitudes: []
    };
  }

  const promedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
  const min = Math.min(...tiempos);
  const max = Math.max(...tiempos);

  return {
    promedio: Number(promedio.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    totalCompletadasMes: solicitudesCompletadasMes.length,
    solicitudes: solicitudesCompletadasMes.sort((a, b) => a.dias - b.dias)
  };
}

/**
 * Métrica 2: ratio de aceptación
 */
function calcularMetricaAceptacion(solicitudes) {
  const total = solicitudes.length;

  const aprobadas = solicitudes.filter(
    (s) => ESTADOS_APROBADOS.includes(s.fields?.status?.name)
  ).length;

  const rechazadas = solicitudes.filter(
    (s) => ESTADOS_RECHAZADOS.includes(s.fields?.status?.name)
  ).length;

  const enProceso = total - aprobadas - rechazadas;
  const procesadas = aprobadas + rechazadas;
  const ratioAceptacion = procesadas > 0 ? (aprobadas / procesadas) * 100 : 0;

  return {
    total,
    aprobadas,
    rechazadas,
    enProceso,
    procesadas,
    ratioAceptacion: Number(ratioAceptacion.toFixed(2))
  };
}

/**
 * Métrica 3: gasto por categoría
 */
function calcularMetricaGasto(solicitudes) {
  const acumulado = new Map();

  for (const issue of solicitudes) {
    const fields = issue.fields || {};
    const categoria = getCategoriaValue(fields[FIELD_CATEGORIA]);
    const monto = getMontoValue(fields[FIELD_MONTO]);

    if (!acumulado.has(categoria)) {
      acumulado.set(categoria, {
        categoria,
        total: 0,
        count: 0,
        solicitudes: []
      });
    }

    const entry = acumulado.get(categoria);
    entry.total += monto;
    entry.count += 1;
    entry.solicitudes.push({
      key: issue.key,
      monto
    });
  }

  const categorias = Array.from(acumulado.values());
  const gastoTotalGeneral = categorias.reduce((acc, item) => acc + item.total, 0);

  const categoriasFormateadas = categorias
    .map((item) => {
      const promedio = item.count > 0 ? item.total / item.count : 0;
      const porcentaje = gastoTotalGeneral > 0 ? (item.total / gastoTotalGeneral) * 100 : 0;

      return {
        categoria: item.categoria,
        total: Number(item.total.toFixed(2)),
        count: item.count,
        promedio: Number(promedio.toFixed(2)),
        porcentaje: Number(porcentaje.toFixed(2)),
        solicitudes: item.solicitudes
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    gastoTotalGeneral: Number(gastoTotalGeneral.toFixed(2)),
    categorias: categoriasFormateadas
  };
}

/**
 * Endpoint de salud
 */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    mensaje: "Backend de métricas Jira funcionando"
  });
});

/**
 * Endpoint principal para frontend
 */
app.get("/api/metricas", async (req, res) => {
  try {
    const solicitudes = await obtenerSolicitudes();

    const metric1 = calcularMetricaTiempo(solicitudes);
    const metric2 = calcularMetricaAceptacion(solicitudes);
    const metric3 = calcularMetricaGasto(solicitudes);

    res.json({
      ok: true,
      proyecto: JIRA_PROJECT_KEY,
      totalSolicitudes: solicitudes.length,
      metric1,
      metric2,
      metric3
    });
  } catch (error) {
    console.error("Error en /api/metricas:", error.message);

    res.status(500).json({
      ok: false,
      mensaje: "No se pudieron obtener las métricas de Jira",
      error: error.message
    });
  }
});
app.get("/api/debug-fields", async (req, res) => {
  try {
    const solicitudes = await obtenerSolicitudes();
    const primera = solicitudes[0];

    res.json({
      key: primera.key,
      fields: primera.fields
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/debug-jira-fields", async (req, res) => {
  try {
    const data = await jiraRequest("/rest/api/3/field");
    res.json(
      data.map(field => ({
        id: field.id,
        name: field.name,
        custom: field.custom
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
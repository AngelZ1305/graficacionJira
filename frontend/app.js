let chartTiempoInstance = null;
let chartAceptacionInstance = null;
let chartGastoCategoriaInstance = null;

async function cargarMetricas() {
  try {
    const res = await fetch("http://localhost:3000/api/metricas");
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.mensaje || "Error al cargar métricas");
    }

    return data;
  } catch (error) {
    console.error(error);
    alert("No se pudieron cargar las métricas");
    return null;
  }
}

function renderKPIs(datos) {
  document.getElementById("kpiTiempoPromedio").textContent =
    `${datos.metric1.promedio.toFixed(2)} días`;

  document.getElementById("kpiRatioAceptacion").textContent =
    `${datos.metric2.ratioAceptacion.toFixed(2)}%`;

  document.getElementById("kpiGastoTotal").textContent =
    `$${datos.metric3.gastoTotalGeneral.toLocaleString()}`;
}

function renderChartTiempo(datos) {
  const solicitudesOrdenadas = [...datos.metric1.solicitudes].sort(
    (a, b) => a.dias - b.dias
  );

  if (chartTiempoInstance) {
    chartTiempoInstance.destroy();
  }

  chartTiempoInstance = new Chart(document.getElementById("chartTiempo"), {
    type: "bar",
    data: {
      labels: solicitudesOrdenadas.map((s) => s.key),
      datasets: [
        {
          label: "Días de completado",
          data: solicitudesOrdenadas.map((s) => s.dias),
          borderWidth: 4
        },
        {
          type: "line",
          label: "Promedio",
          data: solicitudesOrdenadas.map(() => datos.metric1.promedio),
          borderWidth: 2,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              return `${context.dataset.label}: ${Number(context.raw).toFixed(2)} días`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Días"
          }
        },
        x: {
          title: {
            display: true,
            text: "Solicitud"
          }
        }
      }
    }
  });
}

function renderChartAceptacion(datos) {
  if (chartAceptacionInstance) {
    chartAceptacionInstance.destroy();
  }

  chartAceptacionInstance = new Chart(document.getElementById("chartAceptacion"), {
    type: "doughnut",
    data: {
      labels: ["Aprobadas", "Rechazadas", "En proceso"],
      datasets: [
        {
          data: [
            datos.metric2.aprobadas,
            datos.metric2.rechazadas,
            datos.metric2.enProceso
          ],
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const value = context.raw;
              const porcentaje = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
              return `${context.label}: ${value} (${porcentaje}%)`;
            }
          }
        }
      }
    }
  });
}

function renderChartGasto(datos) {
  const categoriasOrdenadas = [...datos.metric3.categorias].sort(
    (a, b) => b.total - a.total
  );

  if (chartGastoCategoriaInstance) {
    chartGastoCategoriaInstance.destroy();
  }

  chartGastoCategoriaInstance = new Chart(
    document.getElementById("chartGastoCategoria"),
    {
      type: "bar",
      data: {
        labels: categoriasOrdenadas.map((c) => c.categoria),
        datasets: [
          {
            label: "Gasto total",
            data: categoriasOrdenadas.map((c) => c.total),
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: function (context) {
                const item = categoriasOrdenadas[context.dataIndex];
                return [
                  `Total: $${item.total.toLocaleString()}`,
                  `Solicitudes: ${item.count}`,
                  `Promedio: $${item.promedio.toLocaleString()}`,
                  `% del total: ${item.porcentaje.toFixed(1)}%`
                ];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Monto"
            }
          },
          x: {
            title: {
              display: true,
              text: "Categoría"
            }
          }
        }
      }
    }
  );
}

function renderMetricas(datos) {
  renderKPIs(datos);
  renderChartTiempo(datos);
  renderChartAceptacion(datos);
  renderChartGasto(datos);

  const updatedAtEl = document.getElementById("updatedAt");
  if (updatedAtEl && datos.updatedAt) {
    updatedAtEl.textContent = `Última actualización: ${new Date(datos.updatedAt).toLocaleString()}`;
  }
}

function conectarWebSocket() {
  const ws = new WebSocket("ws://localhost:3000/ws");
  let pingInterval = null;

  ws.onopen = () => {
    console.log("Conectado al WebSocket");
    const statusEl = document.getElementById("wsStatus");
    if (statusEl) statusEl.textContent = "Conectado";

    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 30000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (
        msg.type === "metricas_iniciales" ||
        msg.type === "metricas_actualizadas"
      ) {
        renderMetricas(msg.data);
      }
    } catch (error) {
      console.error("Error procesando mensaje WS:", error);
    }
  };

  ws.onclose = () => {
    console.warn("WebSocket desconectado");
    const statusEl = document.getElementById("wsStatus");
    if (statusEl) statusEl.textContent = "Desconectado";

    if (pingInterval) clearInterval(pingInterval);

    setTimeout(() => {
      conectarWebSocket();
    }, 5000);
  };

  ws.onerror = (error) => {
    console.error("Error WebSocket:", error);
    const statusEl = document.getElementById("wsStatus");
    if (statusEl) statusEl.textContent = "Error";
  };
}

(async function init() {
  // Primer render por HTTP como respaldo
  const datos = await cargarMetricas();
  if (datos) {
    renderMetricas(datos);
  }

  // Luego conexión en tiempo real
  conectarWebSocket();
})();
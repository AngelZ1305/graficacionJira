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

(async function init() {
  const datos = await cargarMetricas();
  if (!datos) return;

  document.getElementById("kpiTiempoPromedio").textContent =
    `${datos.metric1.promedio.toFixed(2)} días`;

  document.getElementById("kpiRatioAceptacion").textContent =
    `${datos.metric2.ratioAceptacion.toFixed(2)}%`;

  document.getElementById("kpiGastoTotal").textContent =
    `$${datos.metric3.gastoTotalGeneral.toLocaleString()}`;


// KPIs
document.getElementById("kpiTiempoPromedio").textContent =
  `${datos.metric1.promedio.toFixed(2)} días`;

document.getElementById("kpiRatioAceptacion").textContent =
  `${datos.metric2.ratioAceptacion.toFixed(2)}%`;

document.getElementById("kpiGastoTotal").textContent =
  `$${datos.metric3.gastoTotalGeneral.toLocaleString()}`;

// ============================
// 1) Tiempo de completado
// ============================
const solicitudesOrdenadas = [...datos.metric1.solicitudes]
  .sort((a, b) => a.dias - b.dias);

new Chart(document.getElementById("chartTiempo"), {
  type: "bar",
  data: {
    labels: solicitudesOrdenadas.map(s => s.key),
    datasets: [
      {
        label: "Días de completado",
        data: solicitudesOrdenadas.map(s => s.dias),
        borderWidth: 1
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
          label: function(context) {
            return `${context.dataset.label}: ${context.raw.toFixed(2)} días`;
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

// ============================
// 2) Ratio de aceptación
// ============================
new Chart(document.getElementById("chartAceptacion"), {
  type: "doughnut",
  data: {
    labels: ["Aprobadas", "Rechazadas", "En proceso"],
    datasets: [{
      data: [
        datos.metric2.aprobadas,
        datos.metric2.rechazadas,
        datos.metric2.enProceso
      ],
      borderWidth: 1
    }]
  },
  options: {
    responsive: true,
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const value = context.raw;
            const porcentaje = ((value / total) * 100).toFixed(1);
            return `${context.label}: ${value} (${porcentaje}%)`;
          }
        }
      }
    }
  }
});

// ============================
// 3) Gasto por categoría
// ============================
const categoriasOrdenadas = [...datos.metric3.categorias]
  .sort((a, b) => b.total - a.total);

new Chart(document.getElementById("chartGastoCategoria"), {
  type: "bar",
  data: {
    labels: categoriasOrdenadas.map(c => c.categoria),
    datasets: [{
      label: "Gasto total",
      data: categoriasOrdenadas.map(c => c.total),
      borderWidth: 1
    }]
  },
  options: {
    indexAxis: "y",
    responsive: true,
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
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
      x: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Monto"
        }
      },
      y: {
        title: {
          display: true,
          text: "Categoría"
        }
      }
    }
  }
});})();
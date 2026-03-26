/**
 * Lead Analytics Chart Logic - Refined Version
 * Handles Chart.js initialization with gradients, datalabels, tooltips, and export.
 */

let leadAnalyticsChart = null;

// Register DataLabels plugin globally if available
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

document.addEventListener('DOMContentLoaded', () => {
    const chartCanvas = document.getElementById('leadAnalyticsChart');
    if (chartCanvas) {
        initLeadAnalyticsChart();
    }
});

/**
 * Initializes the Chart.js instance with professional styling, gradients, and datalabels.
 */
function initLeadAnalyticsChart() {
    console.log('Initializing Refined Lead Analytics Chart...');
    const ctx = document.getElementById('leadAnalyticsChart');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (leadAnalyticsChart) {
        leadAnalyticsChart.destroy();
    }

    // Create Gradient
    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, 400);
    // Updated to Professional Saffron-Orange Gradient Theme
    gradient.addColorStop(0, 'rgba(255, 153, 51, 1)');   // #2C4A7C (Saffron)
    gradient.addColorStop(1, 'rgba(255, 94, 0, 0.8)');  // #132D55 (Deep Orange)

    try {
        leadAnalyticsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'New Leads',
                    data: [],
                    backgroundColor: gradient,
                    borderColor: '#2C4A7C',
                    borderWidth: 1,
                    borderRadius: 8,
                    hoverBackgroundColor: 'rgba(255, 94, 0, 0.9)',
                    hoverBorderWidth: 2,
                    hoverBorderColor: '#e68a00',
                    barThickness: 'flex',
                    maxBarThickness: 45
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 35,
                        right: 20,
                        left: 10,
                        bottom: 0
                    }
                },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        color: '#0F172A',
                        font: { weight: '800', size: 14 },
                        formatter: (value) => value > 0 ? value : '',
                        offset: 6
                    },
                    tooltip: {
                        backgroundColor: '#1E293B',
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                return ` Leads: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grace: '15%',
                        grid: { color: '#F1F5F9', drawBorder: false },
                        ticks: {
                            stepSize: 1,
                            color: '#64748B',
                            font: { size: 11, weight: '600' },
                            padding: 10
                        },
                        title: {
                            display: true,
                            text: 'LEAD COUNT',
                            color: '#94A3B8',
                            font: { size: 10, weight: '800', letterSpacing: 1 }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#1E293B',
                            font: { size: 12, weight: '700' },
                            padding: 10
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const label = leadAnalyticsChart.data.labels[index];
                        const value = leadAnalyticsChart.data.datasets[0].data[index];
                        onBarClick(label, value);
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                animation: {
                    duration: 1500,
                    easing: 'easeOutElastic'
                }
            }
        });

        updateLeadAnalyticsChart();
    } catch (err) {
        console.error('Chart initialization failed:', err);
    }
}

/**
 * Fetches data and updates chart/insights.
 */
async function updateLeadAnalyticsChart() {
    const period = document.getElementById('leadChartPeriod')?.value || 'week';
    const loadingOverlay = document.getElementById('chartLoadingOverlay');
    const emptyState = document.getElementById('chartEmptyState');
    const chartCanvas = document.getElementById('leadAnalyticsChart');

    // Auth context (globals from dashboard.js)
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '/api';
    const token = typeof authToken !== 'undefined' ? authToken : localStorage.getItem('authToken');

    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';

    try {
        const response = await fetch(`${apiBase}/analytics/leads/stats?period=${period}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Fetch failed');
        const data = await response.json();

        // Update Chart
        if (leadAnalyticsChart) {
            leadAnalyticsChart.data.labels = data.labels;
            leadAnalyticsChart.data.datasets[0].data = data.datasets[0].data;
            leadAnalyticsChart.update();
        }

        // Update Insights
        document.getElementById('totalLeads').textContent = data.total;
        document.getElementById('bestDay').textContent = data.bestDay;

        const trendEl = document.getElementById('leadTrend');
        if (trendEl) {
            trendEl.textContent = data.trend;
            const isUp = data.trend.startsWith('+');
            trendEl.className = `chart-stat-val ${isUp ? 'trend-up' : 'trend-down'}`;
        }

        // Calculate Average
        const avgLeadsEl = document.getElementById('avgLeads');
        if (avgLeadsEl) {
            const activeDays = data.datasets[0].data.length || 1;
            const avg = (data.total / activeDays).toFixed(1);
            avgLeadsEl.textContent = avg;
        }

        // State UI
        if (data.total === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            if (chartCanvas) chartCanvas.style.visibility = 'hidden';
        } else {
            if (emptyState) emptyState.style.display = 'none';
            if (chartCanvas) chartCanvas.style.visibility = 'visible';
        }
    } catch (err) {
        console.error('Update failed:', err);
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

/**
 * Exports chart as PNG image.
 */
function exportLeadChart() {
    const canvas = document.getElementById('leadAnalyticsChart');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `lead-analytics-${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

/**
 * Handles bar click event.
 */
function onBarClick(label, value) {
    if (typeof showNotification === 'function') {
        showNotification(`You gained ${value} lead(s) on ${label}!`, 'info');
    } else {
        alert(`You gained ${value} lead(s) on ${label}!`);
    }

    // Optionally: showSection('leads') and filter by that day
}

// Hook into existing refresh if possible
if (typeof refreshDashboard === 'function') {
    const originalRefresh = window.refreshDashboard;
    window.refreshDashboard = async function () {
        await originalRefresh();
        updateLeadAnalyticsChart();
    };
}

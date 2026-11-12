// app/static/dashboard.js - Executive Dashboard Controller & Interactive Engine
document.addEventListener('DOMContentLoaded', () => {
    let dashboardState = window.__DASHBOARD_DATA__ || null;
    let activePeriod = '30d'; // '7d' or '30d'

    init();

    function init() {
        // If server rendered initial state into window, initialize from it
        if (dashboardState) {
            renderSalesChart(activePeriod);
            renderNotificationPopover(dashboardState.smart_alerts || []);
        } else {
            refreshDashboard();
        }

        setupEventListeners();
        setupClock();
    }

    function setupEventListeners() {
        // Period Toggle Buttons (7d vs 30d)
        const periodPills = document.querySelectorAll('.period-pill');
        periodPills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                periodPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                activePeriod = pill.getAttribute('data-period');
                renderSalesChart(activePeriod);
            });
        });

        // Refresh Button
        const refreshBtn = document.getElementById('btnRefreshDashboard');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshDashboard();
            });
        }

        // Recent Activity Tabs (Sales vs GRN)
        const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                document.querySelectorAll('.activity-tab-content').forEach(tab => {
                    tab.style.display = 'none';
                });
                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.style.display = 'block';
            });
        });

        // Notification Bell Toggle
        const notifBtn = document.getElementById('btnNotifications');
        const notifPopover = document.getElementById('notificationsPopover');
        if (notifBtn && notifPopover) {
            notifBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = notifPopover.style.display === 'block';
                notifPopover.style.display = isVisible ? 'none' : 'block';
            });

            document.addEventListener('click', (e) => {
                if (!notifPopover.contains(e.target) && e.target !== notifBtn) {
                    notifPopover.style.display = 'none';
                }
            });
        }

        // Global Medicine Search with Debounce
        const searchInput = document.getElementById('globalMedicineSearch');
        const searchDropdown = document.getElementById('globalSearchDropdown');
        let searchTimeout = null;

        if (searchInput && searchDropdown) {
            // Global shortcut Ctrl+K to focus search
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    searchInput.focus();
                }
            });

            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                const query = searchInput.value.trim();
                if (query.length < 2) {
                    searchDropdown.style.display = 'none';
                    searchDropdown.innerHTML = '';
                    return;
                }

                searchTimeout = setTimeout(async () => {
                    try {
                        const res = await fetch(`/medicines?q=${encodeURIComponent(query)}&limit=6`);
                        if (!res.ok) return;
                        const data = await res.json();
                        renderSearchResults(data, searchDropdown);
                    } catch (err) {
                        console.error('Medicine search error', err);
                    }
                }, 250);
            });

            document.addEventListener('click', (e) => {
                if (!searchDropdown.contains(e.target) && e.target !== searchInput) {
                    searchDropdown.style.display = 'none';
                }
            });
        }
    }

    function renderSearchResults(items, dropdown) {
        if (!items || items.length === 0) {
            dropdown.innerHTML = '<div style="padding:0.65rem; color:#64748b; font-size:0.8rem; text-align:center;">No matching medicines found</div>';
            dropdown.style.display = 'block';
            return;
        }

        dropdown.innerHTML = items.map(m => `
            <a href="/medicines-page" class="search-result-item">
                <div>
                    <div class="search-item-brand">${escapeHtml(m.brand_name)} <span style="font-size:0.75rem; color:#64748b;">${escapeHtml(m.strength || '')}</span></div>
                    <div class="search-item-desc">${escapeHtml(m.generic_name || '')} &bull; ${escapeHtml(m.dosage_form || '')}</div>
                </div>
                <div class="search-item-stock">${m.total_stock || 0} in stock</div>
            </a>
        `).join('');
        dropdown.style.display = 'block';
    }

    async function refreshDashboard() {
        const refreshBtn = document.getElementById('btnRefreshDashboard');
        if (refreshBtn) refreshBtn.classList.add('spinning');

        try {
            const res = await fetch('/api/dashboard/summary');
            if (!res.ok) throw new Error('Failed to fetch dashboard summary');
            const data = await res.json();
            dashboardState = data;
            window.__DASHBOARD_DATA__ = data;

            updateKPIValues(data);
            renderSalesChart(activePeriod);
            renderNotificationPopover(data.smart_alerts || []);
            
            const timeElem = document.getElementById('lastUpdatedTime');
            if (timeElem && data.last_updated) {
                timeElem.textContent = data.last_updated;
            }

            if (typeof showAlert === 'function') {
                showAlert('Dashboard metrics successfully updated with real-time data.', 'success');
            }
        } catch (err) {
            console.error('Error refreshing dashboard:', err);
            if (typeof showAlert === 'function') {
                showAlert('Could not refresh dashboard metrics. Please check network connection.', 'danger');
            }
        } finally {
            if (refreshBtn) {
                setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
            }
        }
    }

    function updateKPIValues(data) {
        // Today's Sales
        const sales = data.kpi_today_sales || {};
        const revElem = document.getElementById('kpi-today-rev');
        if (revElem) revElem.textContent = `₹${formatIndianCurrency(sales.today_rev || 0)}`;
        const billsElem = document.getElementById('kpi-today-bills');
        if (billsElem) billsElem.textContent = `${sales.today_bills || 0} bills today`;

        // Inventory Value
        const inv = data.kpi_inventory || {};
        const invValElem = document.getElementById('kpi-inv-val');
        if (invValElem) invValElem.textContent = `₹${formatIndianCurrency(inv.total_val || 0)}`;
        const invSubElem = document.getElementById('kpi-inv-sub');
        if (invSubElem) invSubElem.textContent = `${inv.active_skus || 0} active SKUs • ${formatNumber(inv.total_units || 0)} units`;

        // Low Stock
        const ls = data.kpi_low_stock || {};
        const lsElem = document.getElementById('kpi-low-stock-count');
        if (lsElem) lsElem.textContent = `${ls.low_stock_count || 0} items`;
        const oosElem = document.getElementById('kpi-out-of-stock');
        if (oosElem) oosElem.textContent = `${ls.out_of_stock_count || 0} critical stockouts`;

        // Expiry Risk
        const exp = data.kpi_expiry || {};
        const expRiskElem = document.getElementById('kpi-risk-val');
        if (expRiskElem) expRiskElem.textContent = `₹${formatIndianCurrency(exp.total_at_risk_val || 0)}`;
        const expSubElem = document.getElementById('kpi-risk-sub');
        if (expSubElem) expSubElem.textContent = `${exp.expired_count || 0} expired • ${exp.red_count || 0} red band (≤30d)`;

        // Health Score
        const health = data.kpi_health || {};
        const healthElem = document.getElementById('kpi-health-score');
        if (healthElem) healthElem.textContent = `${health.score || 0}/100`;
        const healthStatusElem = document.getElementById('kpi-health-status');
        if (healthStatusElem) {
            healthStatusElem.textContent = health.status || 'Good';
            healthStatusElem.className = `badge badge-${health.color || 'teal'}`;
        }
    }

    function renderNotificationPopover(alerts) {
        const badge = document.getElementById('topbarNotificationBadge');
        const popoverBadge = document.getElementById('popoverBadgeCount');
        const list = document.getElementById('popoverAlertsList');

        const count = alerts ? alerts.length : 0;
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
        if (popoverBadge) {
            popoverBadge.textContent = `${count} active`;
        }

        if (list) {
            if (!alerts || alerts.length === 0) {
                list.innerHTML = '<div class="popover-empty">All stock parameters within safe limits.</div>';
                return;
            }

            list.innerHTML = alerts.map(a => `
                <div class="popover-alert-item ${a.type}">
                    <div class="popover-alert-title">${escapeHtml(a.title)}</div>
                    <div>${escapeHtml(a.message)}</div>
                    <div style="margin-top:0.4rem;">
                        <a href="${a.cta_url}" class="alert-btn-action" style="font-size:0.7rem;">${escapeHtml(a.cta_text)} →</a>
                    </div>
                </div>
            `).join('');
        }
    }

    // ==========================================================================
    // Interactive SVG/Canvas Sales Trends Chart
    // ==========================================================================
    function renderSalesChart(period) {
        const container = document.getElementById('salesChartContainer');
        if (!container || !dashboardState) return;

        const trendData = (period === '7d')
            ? (dashboardState.sales_trend_7d || [])
            : (dashboardState.sales_trend_30d || []);

        if (trendData.length === 0) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-size:0.85rem;">No historical sales records available for this reporting window.</div>';
            return;
        }

        // Update Summary Pills
        const totalRev = trendData.reduce((acc, d) => acc + (d.revenue || 0), 0);
        const totalBills = trendData.reduce((acc, d) => acc + (d.bills || 0), 0);
        const aov = totalBills > 0 ? (totalRev / totalBills) : 0;

        const periodRevElem = document.getElementById('chartPeriodRevenue');
        if (periodRevElem) periodRevElem.textContent = `₹${formatIndianCurrency(totalRev)}`;
        const periodBillsElem = document.getElementById('chartPeriodBills');
        if (periodBillsElem) periodBillsElem.textContent = `${totalBills}`;
        const aovElem = document.getElementById('chartPeriodAOV');
        if (aovElem) aovElem.textContent = `₹${aov.toFixed(2)}`;

        // Render SVG Chart
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 280;
        const padding = { top: 25, right: 35, bottom: 40, left: 60 };

        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const maxRev = Math.max(...trendData.map(d => d.revenue || 0), 100);
        const yMax = Math.ceil(maxRev * 1.15);

        // Horizontal Gridlines (4 levels)
        const ySteps = 4;
        let gridHtml = '';
        for (let i = 0; i <= ySteps; i++) {
            const yVal = (yMax / ySteps) * i;
            const yPos = padding.top + chartHeight - (i / ySteps) * chartHeight;
            gridHtml += `
                <line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" stroke="#F1F5F9" stroke-width="1.5" />
                <text x="${padding.left - 10}" y="${yPos + 4}" fill="#94A3B8" font-size="10" text-anchor="end">₹${formatCompactNumber(yVal)}</text>
            `;
        }

        // Calculate Data Points
        const stepX = chartWidth / Math.max(trendData.length - 1, 1);
        const points = trendData.map((d, i) => {
            const x = padding.left + i * stepX;
            const y = padding.top + chartHeight - ((d.revenue || 0) / yMax) * chartHeight;
            return { x, y, data: d };
        });

        // Path generators
        let pathD = '';
        points.forEach((p, i) => {
            if (i === 0) pathD += `M ${p.x} ${p.y}`;
            else {
                // Bezier curve smoothing
                const prev = points[i - 1];
                const cx1 = prev.x + (p.x - prev.x) / 2;
                const cy1 = prev.y;
                const cx2 = prev.x + (p.x - prev.x) / 2;
                const cy2 = p.y;
                pathD += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p.x} ${p.y}`;
            }
        });

        // Closed area path for gradient
        const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

        // Bars behind curve for volume
        const barWidth = Math.max(6, Math.min(22, stepX * 0.45));
        let barsHtml = '';
        points.forEach(p => {
            const barH = (padding.top + chartHeight) - p.y;
            barsHtml += `
                <rect x="${p.x - barWidth / 2}" y="${p.y}" width="${barWidth}" height="${barH}" fill="#0D9488" opacity="0.12" rx="3" />
            `;
        });

        // X-Axis Labels (sample every N days to avoid clutter)
        const labelInterval = Math.max(1, Math.floor(trendData.length / 8));
        let xLabelsHtml = '';
        points.forEach((p, i) => {
            if (i % labelInterval === 0 || i === points.length - 1) {
                const dateParts = p.data.date.split('-');
                const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : p.data.date;
                xLabelsHtml += `
                    <text x="${p.x}" y="${padding.top + chartHeight + 20}" fill="#94A3B8" font-size="10" text-anchor="middle">${formattedDate}</text>
                `;
            }
        });

        // Interactive Dots
        let dotsHtml = '';
        points.forEach((p, idx) => {
            dotsHtml += `
                <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#FFFFFF" stroke="#0D9488" stroke-width="2.5" class="chart-point-dot" data-index="${idx}" style="cursor: pointer; transition: transform 0.15s;" />
                <!-- Invisible hover area -->
                <circle cx="${p.x}" cy="${p.y}" r="14" fill="transparent" class="chart-hover-target" data-index="${idx}" style="cursor: pointer;" />
            `;
        });

        const svgContent = `
            <svg class="chart-svg-elem" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="chartTealGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#0D9488" stop-opacity="0.32" />
                        <stop offset="100%" stop-color="#0D9488" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                ${gridHtml}
                ${barsHtml}
                <path d="${areaD}" fill="url(#chartTealGrad)" />
                <path d="${pathD}" fill="none" stroke="#0D9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                ${dotsHtml}
                ${xLabelsHtml}
            </svg>
            <div id="chartTooltip" class="chart-tooltip-floating"></div>
        `;

        container.innerHTML = svgContent;

        // Tooltip Interaction
        const tooltip = document.getElementById('chartTooltip');
        const hoverTargets = container.querySelectorAll('.chart-hover-target');

        hoverTargets.forEach(target => {
            target.addEventListener('mouseenter', (e) => {
                const idx = parseInt(target.getAttribute('data-index'));
                const pt = points[idx];
                const d = pt.data;

                tooltip.innerHTML = `
                    <div style="font-weight:700; color:#2DD4BF; margin-bottom:0.2rem;">${d.date}</div>
                    <div style="font-size:0.85rem; font-weight:800;">₹${formatIndianCurrency(d.revenue || 0)}</div>
                    <div style="font-size:0.75rem; color:#CBD5E1;">${d.bills || 0} bills &bull; Avg ₹${(d.aov || 0).toFixed(2)}</div>
                `;
                tooltip.style.left = `${pt.x}px`;
                tooltip.style.top = `${pt.y}px`;
                tooltip.style.display = 'block';

                // Enlarge active dot
                const dot = container.querySelector(`.chart-point-dot[data-index="${idx}"]`);
                if (dot) dot.setAttribute('r', '7');
            });

            target.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
                container.querySelectorAll('.chart-point-dot').forEach(d => d.setAttribute('r', '4.5'));
            });
        });
    }

    // Helper: Real-time Clock in IST
    function setupClock() {
        const clockElem = document.getElementById('liveClockDisplay');
        if (!clockElem) return;

        function updateTime() {
            const now = new Date();
            clockElem.textContent = now.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        }
        updateTime();
        setInterval(updateTime, 1000);
    }

    // Utility Formatters
    function formatIndianCurrency(num) {
        return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatNumber(num) {
        return Number(num).toLocaleString('en-IN');
    }

    function formatCompactNumber(num) {
        if (num >= 10000000) return (num / 10000000).toFixed(1) + 'Cr';
        if (num >= 100000) return (num / 100000).toFixed(1) + 'L';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return Math.round(num);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
});

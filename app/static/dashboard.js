// app/static/dashboard.js - Executive Dashboard Controller & Interactive Engine
document.addEventListener('DOMContentLoaded', () => {
    let dashboardState = window.__DASHBOARD_DATA__ || null;
    let activePeriod = '30d'; // '7d' or '30d'

    init();

    function init() {
        window.refreshDashboard = refreshDashboard;
        // If server rendered initial state into window, initialize from it
        if (dashboardState) {
            renderSalesChart(activePeriod);
            renderNotificationPopover(dashboardState.smart_alerts || []);
        } else {
            refreshDashboard();
        }

        setupEventListeners();
        setupClock();
        setupAISmartScanning();
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

    // =========================================================================
    // AI SMART PHARMACY SCANNING ENGINE (Voice, Barcode/QR, Camera OCR)
    // =========================================================================
    function setupAISmartScanning() {
        // Modal Open Buttons
        const btnVoice = document.getElementById('btnOpenVoiceModal');
        const btnBarcode = document.getElementById('btnOpenBarcodeModal');
        const btnOCR = document.getElementById('btnOpenOCRModal');

        const modalVoice = document.getElementById('modalVoiceEntry');
        const modalBarcode = document.getElementById('modalBarcodeScanner');
        const modalOCR = document.getElementById('modalOCRScanner');

        // Camera stream states
        let qrStream = null;
        let ocrStream = null;

        function stopAllCameraStreams() {
            if (qrStream) {
                qrStream.getTracks().forEach(t => t.stop());
                qrStream = null;
            }
            if (ocrStream) {
                ocrStream.getTracks().forEach(t => t.stop());
                ocrStream = null;
            }
            const qrWrapper = document.getElementById('qrCameraWrapper');
            if (qrWrapper) qrWrapper.style.display = 'none';
            const ocrWrapper = document.getElementById('ocrCameraWrapper');
            if (ocrWrapper) ocrWrapper.style.display = 'none';
        }

        if (btnVoice && modalVoice) {
            btnVoice.addEventListener('click', () => modalVoice.classList.add('active'));
        }
        if (btnBarcode && modalBarcode) {
            btnBarcode.addEventListener('click', () => modalBarcode.classList.add('active'));
        }
        if (btnOCR && modalOCR) {
            btnOCR.addEventListener('click', () => modalOCR.classList.add('active'));
        }

        // Modal Close Buttons
        document.querySelectorAll('.btn-modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.getAttribute('data-close');
                const m = document.getElementById(modalId);
                if (m) m.classList.remove('active');
                stopAllCameraStreams();
            });
        });

        // Close on backdrop click
        [modalVoice, modalBarcode, modalOCR].forEach(m => {
            if (m) {
                m.addEventListener('click', (e) => {
                    if (e.target === m) {
                        m.classList.remove('active');
                        stopAllCameraStreams();
                    }
                });
            }
        });

        // Floating Toast Notification
        function showAIToast(message, isSuccess = true) {
            const existing = document.querySelector('.ai-toast-notification');
            if (existing) existing.remove();

            const toast = document.createElement('div');
            toast.className = 'ai-toast-notification';
            toast.style.borderLeftColor = isSuccess ? '#10B981' : '#EF4444';
            toast.innerHTML = `
                <div style="font-size:1.25rem;">${isSuccess ? '✓' : '⚠️'}</div>
                <div>
                    <div style="font-weight:700; font-size:0.88rem;">${isSuccess ? 'Database Update Successful' : 'Notice'}</div>
                    <div style="font-size:0.8rem; color:#CBD5E1; margin-top:2px;">${escapeHtml(message)}</div>
                </div>
            `;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 400);
            }, 4000);
        }

        // =====================================================================
        // 1. VOICE-BASED RECOGNITION & SPEECH-TO-DATABASE
        // =====================================================================
        const btnToggleRecord = document.getElementById('btnToggleRecord');
        const voiceStatusText = document.getElementById('voiceStatusText');
        const voiceTranscriptInput = document.getElementById('voiceTranscriptInput');
        const voiceLangSelect = document.getElementById('voiceLanguageSelect');
        const btnProcessVoice = document.getElementById('btnProcessVoice');
        const btnConfirmVoiceSave = document.getElementById('btnConfirmVoiceSave');

        let recognition = null;
        let isRecording = false;

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
            recognition = new SpeechRec();
            recognition.continuous = false;
            recognition.interimResults = true;

            recognition.onstart = () => {
                isRecording = true;
                btnToggleRecord.classList.add('recording');
                voiceStatusText.textContent = "Listening... Speak now in English or Hindi";
                voiceStatusText.style.color = "#DC2626";
            };

            recognition.onresult = (event) => {
                let current = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    current += event.results[i][0].transcript;
                }
                voiceTranscriptInput.value = current;
            };

            recognition.onerror = (e) => {
                isRecording = false;
                btnToggleRecord.classList.remove('recording');
                voiceStatusText.textContent = "Microphone notice: " + (e.error || 'Check input');
                voiceStatusText.style.color = "#D97706";
            };

            recognition.onend = () => {
                isRecording = false;
                btnToggleRecord.classList.remove('recording');
                voiceStatusText.textContent = "Voice input captured. Reviewing transcription...";
                voiceStatusText.style.color = "var(--text-muted)";
                // Auto trigger extraction if text captured
                if (voiceTranscriptInput.value.trim().length > 5) {
                    processVoiceExtraction();
                }
            };
        }

        if (btnToggleRecord) {
            btnToggleRecord.addEventListener('click', () => {
                if (!recognition) {
                    alert("Speech recognition is not natively supported in this browser. You can type, paste, or click the demo preset pills below to test!");
                    return;
                }
                if (isRecording) {
                    recognition.stop();
                } else {
                    recognition.lang = voiceLangSelect ? voiceLangSelect.value : 'en-IN';
                    recognition.start();
                }
            });
        }

        // Preset Demo Voice Buttons
        document.querySelectorAll('.btn-demo-voice').forEach(pill => {
            pill.addEventListener('click', () => {
                const text = pill.getAttribute('data-text');
                if (voiceTranscriptInput) {
                    voiceTranscriptInput.value = text;
                    processVoiceExtraction();
                }
            });
        });

        async function processVoiceExtraction() {
            const text = voiceTranscriptInput.value.trim();
            if (!text) {
                alert("Please speak into the microphone or enter a voice transcript first.");
                return;
            }

            btnProcessVoice.disabled = true;
            btnProcessVoice.textContent = "Analyzing NLP...";

            try {
                const res = await fetch('/api/scanning/voice', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: text,
                        language: voiceLangSelect ? voiceLangSelect.value : 'en-IN'
                    })
                });
                const json = await res.json();
                if (json.status === 'success') {
                    const d = json.data;
                    document.getElementById('voiceExtractedResult').style.display = 'block';
                    
                    document.getElementById('vInpBrand').value = d.brand_name || '';
                    document.getElementById('vInpGeneric').value = d.generic_name || d.brand_name || '';
                    document.getElementById('vInpBatch').value = d.batch_number || '';
                    document.getElementById('vInpExp').value = d.expiry_date || '';
                    document.getElementById('vInpQty').value = d.quantity || 50;
                    document.getElementById('vInpCost').value = d.purchase_price ? d.purchase_price.toFixed(2) : '15.00';
                    document.getElementById('vInpPrice').value = d.selling_price ? d.selling_price.toFixed(2) : '25.00';
                    if (document.getElementById('vInpDosage')) {
                        document.getElementById('vInpDosage').value = d.dosage_form || 'Tablet';
                    }
                    
                    const badge = document.getElementById('voiceConfidenceBadge');
                    if (badge) badge.textContent = `${d.confidence}% Confidence`;
                }
            } catch (err) {
                alert("Failed to analyze speech input: " + err.message);
            } finally {
                btnProcessVoice.disabled = false;
                btnProcessVoice.textContent = "Extract & Validate Fields →";
            }
        }

        if (btnProcessVoice) {
            btnProcessVoice.addEventListener('click', processVoiceExtraction);
        }

        // Save Voice Medicine directly to database
        if (btnConfirmVoiceSave) {
            btnConfirmVoiceSave.addEventListener('click', async () => {
                const brand = document.getElementById('vInpBrand').value.trim();
                const generic = document.getElementById('vInpGeneric').value.trim();
                const batch = document.getElementById('vInpBatch').value.trim();
                const exp = document.getElementById('vInpExp').value.trim();
                const qty = parseInt(document.getElementById('vInpQty').value, 10);
                const cost = parseFloat(document.getElementById('vInpCost').value);
                const price = parseFloat(document.getElementById('vInpPrice').value);
                const dosage = document.getElementById('vInpDosage') ? document.getElementById('vInpDosage').value : 'Tablet';

                if (!brand || !batch || !exp || isNaN(qty) || qty <= 0) {
                    alert("Please fill in Brand Name, Batch Number, Expiry Date, and valid Quantity.");
                    return;
                }

                btnConfirmVoiceSave.disabled = true;
                btnConfirmVoiceSave.textContent = "Saving to Database...";

                try {
                    const res = await fetch('/api/scanning/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            brand_name: brand,
                            generic_name: generic || brand,
                            strength: "Standard",
                            dosage_form: dosage,
                            category_id: 1,
                            batch_number: batch,
                            expiry_date: exp,
                            quantity: qty,
                            cost_price: isNaN(cost) ? 15.0 : cost,
                            selling_price: isNaN(price) ? 25.0 : price,
                            supplier_id: 1,
                            source: 'VOICE'
                        })
                    });
                    const json = await res.json();
                    if (res.ok && json.status === 'success') {
                        showAIToast(`Saved '${brand}' (Batch ${batch}) into database! Total stock: ${json.data.total_available_stock} units.`);
                        refreshDashboard();
                        setTimeout(() => {
                            if (modalVoice) modalVoice.classList.remove('active');
                            document.getElementById('voiceExtractedResult').style.display = 'none';
                            voiceTranscriptInput.value = '';
                        }, 1200);
                    } else {
                        alert("Database commit failed: " + (json.detail || json.message || "Unknown error"));
                    }
                } catch (err) {
                    alert("Network error saving to database: " + err.message);
                } finally {
                    btnConfirmVoiceSave.disabled = false;
                    btnConfirmVoiceSave.textContent = "💾 Save to Database Now";
                }
            });
        }


        // =====================================================================
        // 2. REAL BARCODE & QR CODE SCANNER (Live Camera + Catalog/Payload)
        // =====================================================================
        const btnToggleQRCamera = document.getElementById('btnToggleQRCamera');
        const btnCloseQRCamera = document.getElementById('btnCloseQRCamera');
        const qrCameraWrapper = document.getElementById('qrCameraWrapper');
        const qrVideoFeed = document.getElementById('qrVideoFeed');
        const btnLookupBarcode = document.getElementById('btnLookupBarcode');
        const barcodeCodeInput = document.getElementById('barcodeCodeInput');
        const barcodeResultContainer = document.getElementById('barcodeResultContainer');

        async function startQRCamera() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Camera access is not supported by your browser in this environment.");
                return;
            }
            try {
                qrStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                if (qrVideoFeed) {
                    qrVideoFeed.srcObject = qrStream;
                    qrVideoFeed.play();
                }
                if (qrCameraWrapper) qrCameraWrapper.style.display = 'block';
                if (btnToggleQRCamera) btnToggleQRCamera.textContent = "📷 Camera Active";

                // Poll BarcodeDetector if natively supported in Chrome / Edge
                if ('BarcodeDetector' in window) {
                    const detector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128', 'data_matrix'] });
                    const interval = setInterval(async () => {
                        if (!qrStream) { clearInterval(interval); return; }
                        try {
                            const barcodes = await detector.detect(qrVideoFeed);
                            if (barcodes && barcodes.length > 0) {
                                const detectedCode = barcodes[0].rawValue;
                                clearInterval(interval);
                                stopAllCameraStreams();
                                if (barcodeCodeInput) barcodeCodeInput.value = detectedCode;
                                performBarcodeLookup(detectedCode);
                            }
                        } catch (e) {}
                    }, 400);
                }
            } catch (err) {
                alert("Could not access camera: " + err.message + ". You can enter the code manually or click a demo QR pill!");
            }
        }

        if (btnToggleQRCamera) {
            btnToggleQRCamera.addEventListener('click', () => {
                if (qrStream) {
                    stopAllCameraStreams();
                    btnToggleQRCamera.textContent = "📷 Start Live Camera Scan";
                } else {
                    startQRCamera();
                }
            });
        }
        if (btnCloseQRCamera) {
            btnCloseQRCamera.addEventListener('click', () => {
                stopAllCameraStreams();
                if (btnToggleQRCamera) btnToggleQRCamera.textContent = "📷 Start Live Camera Scan";
            });
        }

        // Preset Demo QR buttons
        document.querySelectorAll('.btn-demo-qr').forEach(pill => {
            pill.addEventListener('click', () => {
                const code = pill.getAttribute('data-code');
                if (barcodeCodeInput) {
                    barcodeCodeInput.value = code;
                    performBarcodeLookup(code);
                }
            });
        });

        async function performBarcodeLookup(code) {
            if (!code || !code.trim()) {
                alert("Please enter or scan a code first.");
                return;
            }

            btnLookupBarcode.disabled = true;
            btnLookupBarcode.textContent = "Scanning...";

            try {
                const res = await fetch('/api/scanning/barcode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: code.trim() })
                });
                const data = await res.json();
                barcodeResultContainer.style.display = 'block';

                if (data.is_qr_payload && data.structured_data) {
                    // Structured QR Code containing medicine and batch details
                    const s = data.structured_data;
                    barcodeResultContainer.innerHTML = `
                        <div class="extracted-result-box" style="margin-top:0; border-left:4px solid var(--teal-primary);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                                <strong style="font-size:0.95rem; color:var(--text-main);">QR Pharmaceutical Payload Decoded</strong>
                                <span class="badge badge-teal">Structured QR</span>
                            </div>
                            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.75rem;">${escapeHtml(data.message)}</div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.82rem;">
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Brand:</label><input type="text" id="qrInpBrand" value="${escapeHtml(s.brand_name)}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Generic:</label><input type="text" id="qrInpGeneric" value="${escapeHtml(s.generic_name || s.brand_name)}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Batch #:</label><input type="text" id="qrInpBatch" value="${escapeHtml(s.batch_number)}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Expiry:</label><input type="date" id="qrInpExp" value="${escapeHtml(s.expiry_date)}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Qty:</label><input type="number" id="qrInpQty" value="${s.quantity}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Price (₹):</label><input type="number" id="qrInpPrice" value="${s.selling_price}" step="0.5" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            </div>
                            <div style="margin-top:0.85rem; text-align:right;">
                                <button type="button" class="btn btn-sm btn-primary" id="btnSaveQRToDb" style="background:#0D9488; border-color:#0D9488;">
                                    💾 Save QR Data to Database Now
                                </button>
                            </div>
                        </div>
                    `;

                    document.getElementById('btnSaveQRToDb').addEventListener('click', async () => {
                        const brand = document.getElementById('qrInpBrand').value.trim();
                        const generic = document.getElementById('qrInpGeneric').value.trim();
                        const batch = document.getElementById('qrInpBatch').value.trim();
                        const exp = document.getElementById('qrInpExp').value.trim();
                        const qty = parseInt(document.getElementById('qrInpQty').value, 10);
                        const price = parseFloat(document.getElementById('qrInpPrice').value);

                        try {
                            const saveRes = await fetch('/api/scanning/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    brand_name: brand,
                                    generic_name: generic,
                                    strength: s.strength || 'Standard',
                                    dosage_form: s.dosage_form || 'Tablet',
                                    category_id: s.category_id || 1,
                                    batch_number: batch,
                                    expiry_date: exp,
                                    quantity: qty,
                                    cost_price: s.cost_price || 15.0,
                                    selling_price: price,
                                    supplier_id: 1,
                                    source: 'BARCODE_QR'
                                })
                            });
                            const saveJson = await saveRes.json();
                            if (saveRes.ok && saveJson.status === 'success') {
                                showAIToast(`QR Medicine '${brand}' stored in database! Batch: ${batch}`);
                                refreshDashboard();
                                setTimeout(() => {
                                    if (modalBarcode) modalBarcode.classList.remove('active');
                                    barcodeResultContainer.style.display = 'none';
                                }, 1200);
                            } else {
                                alert("Save error: " + (saveJson.detail || saveJson.message));
                            }
                        } catch (e) {
                            alert("Failed to save QR payload: " + e.message);
                        }
                    });

                } else if (data.found && data.medicine) {
                    const m = data.medicine;
                    const fefo = data.fefo_recommended_batch;
                    barcodeResultContainer.innerHTML = `
                        <div class="extracted-result-box" style="margin-top:0;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong style="font-size:1rem; color:var(--text-main);">${escapeHtml(m.brand_name)} (${escapeHtml(m.strength)})</strong>
                                <span class="badge ${m.is_low_stock ? 'badge-amber' : 'badge-green'}">
                                    ${m.is_low_stock ? 'Low Stock Warning' : 'In Stock'}
                                </span>
                            </div>
                            <div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.25rem;">
                                Generic: ${escapeHtml(m.generic_name)} &bull; Category: ${escapeHtml(m.category_name)}
                            </div>
                            <div style="margin-top:0.75rem; font-size:0.85rem; font-weight:700;">
                                Total Available: <span style="color:var(--teal-primary);">${m.total_available_stock} units</span>
                            </div>
                            ${fefo ? `
                            <div style="margin-top:0.75rem; padding:0.6rem; background:#F0FDFA; border:1px solid #99F6E4; border-radius:6px; font-size:0.8rem;">
                                <strong style="color:var(--teal-primary);">⚡ Recommended FEFO Allocation:</strong>
                                <div>Batch <code>${escapeHtml(fefo.batch_number)}</code> &bull; Expires: <strong>${fefo.expiry_date}</strong> (${fefo.days_left}d left) &bull; Price: ₹${fefo.selling_price.toFixed(2)}</div>
                            </div>
                            ` : ''}
                        </div>
                    `;
                } else {
                    barcodeResultContainer.innerHTML = `
                        <div class="extracted-result-box" style="margin-top:0; color:#991B1B; background:#FEF2F2; border-color:#FCA5A5;">
                            <strong>Code Not Found:</strong> ${escapeHtml(data.message)}
                        </div>
                    `;
                }
            } catch (err) {
                alert("Lookup failed: " + err.message);
            } finally {
                btnLookupBarcode.disabled = false;
                btnLookupBarcode.textContent = "Scan / Lookup";
            }
        }

        if (btnLookupBarcode && barcodeCodeInput) {
            btnLookupBarcode.addEventListener('click', () => {
                performBarcodeLookup(barcodeCodeInput.value);
            });
        }


        // =====================================================================
        // 3. AI CAMERA & OPTICAL PACKAGING OCR (Snap Photo + Direct DB Commit)
        // =====================================================================
        const btnToggleOCRCamera = document.getElementById('btnToggleOCRCamera');
        const btnCloseOCRCamera = document.getElementById('btnCloseOCRCamera');
        const ocrCameraWrapper = document.getElementById('ocrCameraWrapper');
        const ocrVideoFeed = document.getElementById('ocrVideoFeed');
        const btnSnapPhoto = document.getElementById('btnSnapPhoto');
        const snapshotPreviewWrapper = document.getElementById('snapshotPreviewWrapper');
        const snapshotImgPreview = document.getElementById('snapshotImgPreview');

        const btnProcessOCR = document.getElementById('btnProcessOCR');
        const ocrRawTextInput = document.getElementById('ocrRawTextInput');
        const ocrFileInput = document.getElementById('ocrFileInput');
        const ocrResultContainer = document.getElementById('ocrResultContainer');

        let capturedBlob = null;

        async function startOCRCamera() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Camera access is not supported by your browser in this environment.");
                return;
            }
            try {
                ocrStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                if (ocrVideoFeed) {
                    ocrVideoFeed.srcObject = ocrStream;
                    ocrVideoFeed.play();
                }
                if (ocrCameraWrapper) ocrCameraWrapper.style.display = 'block';
                if (btnToggleOCRCamera) btnToggleOCRCamera.textContent = "📷 Camera Viewfinder Active";
            } catch (err) {
                alert("Could not access camera: " + err.message + ". You can upload a photo or use demo presets!");
            }
        }

        if (btnToggleOCRCamera) {
            btnToggleOCRCamera.addEventListener('click', () => {
                if (ocrStream) {
                    stopAllCameraStreams();
                    btnToggleOCRCamera.textContent = "📸 Open Webcam / Camera";
                } else {
                    startOCRCamera();
                }
            });
        }
        if (btnCloseOCRCamera) {
            btnCloseOCRCamera.addEventListener('click', () => {
                stopAllCameraStreams();
                if (btnToggleOCRCamera) btnToggleOCRCamera.textContent = "📸 Open Webcam / Camera";
            });
        }

        // Snap Photo from Live Camera Viewfinder
        if (btnSnapPhoto && ocrVideoFeed) {
            btnSnapPhoto.addEventListener('click', () => {
                const canvas = document.createElement('canvas');
                canvas.width = ocrVideoFeed.videoWidth || 640;
                canvas.height = ocrVideoFeed.videoHeight || 480;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(ocrVideoFeed, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(blob => {
                    capturedBlob = blob;
                    const dataUrl = canvas.toDataURL('image/jpeg');
                    if (snapshotImgPreview) snapshotImgPreview.src = dataUrl;
                    if (snapshotPreviewWrapper) snapshotPreviewWrapper.style.display = 'block';

                    // Stop video stream after snapping photo
                    stopAllCameraStreams();
                    if (btnToggleOCRCamera) btnToggleOCRCamera.textContent = "📸 Retake Camera Photo";

                    // Trigger OCR processing on captured image
                    runOCRProcessing();
                }, 'image/jpeg', 0.9);
            });
        }

        // Demo OCR Presets
        document.querySelectorAll('.btn-demo-ocr').forEach(pill => {
            pill.addEventListener('click', () => {
                const text = pill.getAttribute('data-text');
                if (ocrRawTextInput) {
                    ocrRawTextInput.value = text;
                    runOCRProcessing();
                }
            });
        });

        async function runOCRProcessing() {
            btnProcessOCR.disabled = true;
            btnProcessOCR.textContent = "Running Optical OCR...";

            const formData = new FormData();
            if (capturedBlob) {
                formData.append('file', capturedBlob, 'captured_packaging.jpg');
            } else if (ocrFileInput && ocrFileInput.files.length > 0) {
                formData.append('file', ocrFileInput.files[0]);
            }
            if (ocrRawTextInput && ocrRawTextInput.value.trim()) {
                formData.append('raw_text', ocrRawTextInput.value.trim());
            }

            try {
                const res = await fetch('/api/scanning/ocr', {
                    method: 'POST',
                    body: formData
                });
                const json = await res.json();
                ocrResultContainer.style.display = 'block';

                if (json.status === 'success') {
                    const d = json.data;
                    ocrResultContainer.innerHTML = `
                        <div class="extracted-result-box" style="margin-top:0; border-left:4px solid var(--teal-primary);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                                <strong style="color:var(--text-main); font-size:0.92rem;">Optical OCR Extracted Packaging Details</strong>
                                <span class="badge badge-green">${d.confidence}% Confidence</span>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.82rem;">
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Brand Name:</label><input type="text" id="ocrInpBrand" value="${escapeHtml(d.brand_name || 'Dolo 650')}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Generic / Formula:</label><input type="text" id="ocrInpGeneric" value="${escapeHtml(d.generic_name || d.brand_name || 'Paracetamol')}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Batch Lot #:</label><input type="text" id="ocrInpBatch" value="${escapeHtml(d.batch_number || 'DLO2025')}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Expiry Date:</label><input type="date" id="ocrInpExp" value="${escapeHtml(d.expiry_date || '2027-12-31')}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Quantity:</label><input type="number" id="ocrInpQty" value="50" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Cost Price (₹):</label><input type="number" id="ocrInpCost" value="${d.cost_price ? d.cost_price.toFixed(2) : '24.50'}" step="0.5" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div><label style="font-size:0.75rem; color:var(--text-muted);">Selling Price / MRP (₹):</label><input type="number" id="ocrInpPrice" value="${d.selling_price ? d.selling_price.toFixed(2) : '34.50'}" step="0.5" class="form-input" style="width:100%; padding:0.3rem;"></div>
                                <div>
                                    <label style="font-size:0.75rem; color:var(--text-muted);">Dosage Form:</label>
                                    <select id="ocrInpDosage" class="form-select" style="width:100%; padding:0.3rem;">
                                        <option value="Tablet" ${d.dosage_form === 'Tablet' ? 'selected' : ''}>Tablet</option>
                                        <option value="Capsule" ${d.dosage_form === 'Capsule' ? 'selected' : ''}>Capsule</option>
                                        <option value="Syrup" ${d.dosage_form === 'Syrup' ? 'selected' : ''}>Syrup</option>
                                        <option value="Injection" ${d.dosage_form === 'Injection' ? 'selected' : ''}>Injection</option>
                                    </select>
                                </div>
                            </div>
                            <div style="margin-top:0.85rem; text-align:right;">
                                <button type="button" class="btn btn-sm btn-primary" id="btnSaveOCRToDb" style="background:#0D9488; border-color:#0D9488;">
                                    💾 Save Camera Packaging to Database Now
                                </button>
                            </div>
                        </div>
                    `;

                    document.getElementById('btnSaveOCRToDb').addEventListener('click', async () => {
                        const brand = document.getElementById('ocrInpBrand').value.trim();
                        const generic = document.getElementById('ocrInpGeneric').value.trim();
                        const batch = document.getElementById('ocrInpBatch').value.trim();
                        const exp = document.getElementById('ocrInpExp').value.trim();
                        const qty = parseInt(document.getElementById('ocrInpQty').value, 10);
                        const cost = parseFloat(document.getElementById('ocrInpCost').value);
                        const price = parseFloat(document.getElementById('ocrInpPrice').value);
                        const dosage = document.getElementById('ocrInpDosage').value;

                        try {
                            const saveRes = await fetch('/api/scanning/save', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    brand_name: brand,
                                    generic_name: generic,
                                    strength: d.strength || 'Standard',
                                    dosage_form: dosage,
                                    category_id: d.category_id || 1,
                                    batch_number: batch,
                                    expiry_date: exp,
                                    quantity: qty,
                                    cost_price: isNaN(cost) ? 20.0 : cost,
                                    selling_price: isNaN(price) ? 30.0 : price,
                                    supplier_id: 1,
                                    source: 'CAMERA_OCR'
                                })
                            });
                            const saveJson = await saveRes.json();
                            if (saveRes.ok && saveJson.status === 'success') {
                                showAIToast(`Camera Packaging '${brand}' (Batch ${batch}) committed to database! Total stock: ${saveJson.data.total_available_stock} units.`);
                                refreshDashboard();
                                setTimeout(() => {
                                    if (modalOCR) modalOCR.classList.remove('active');
                                    ocrResultContainer.style.display = 'none';
                                    if (snapshotPreviewWrapper) snapshotPreviewWrapper.style.display = 'none';
                                    capturedBlob = null;
                                }, 1200);
                            } else {
                                alert("Save error: " + (saveJson.detail || saveJson.message));
                            }
                        } catch (e) {
                            alert("Failed to save OCR data: " + e.message);
                        }
                    });
                }
            } catch (err) {
                alert("OCR processing failed: " + err.message);
            } finally {
                btnProcessOCR.disabled = false;
                btnProcessOCR.textContent = "Run AI OCR Extraction →";
            }
        }

        if (btnProcessOCR) {
            btnProcessOCR.addEventListener('click', runOCRProcessing);
        }
    }
});

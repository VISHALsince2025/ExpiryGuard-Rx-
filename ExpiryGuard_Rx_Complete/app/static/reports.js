// app/static/reports.js - Reports & 9 KPIs Handler
document.addEventListener('DOMContentLoaded', () => {
    init();

    async function init() {
        try {
            const res = await fetch('/reports/kpis');
            if (!res.ok) return;
            const data = await res.json();
            renderKpis(data);
        } catch (err) {
            console.error("Failed to load KPI reports", err);
        }
    }

    function renderKpis(data) {
        // Top Cards
        const nearExp = data.kpi2_near_expiry_value;
        if (nearExp) {
            document.getElementById('kpi2-val').textContent = `₹${nearExp.near_expiry_total.toFixed(2)}`;
            const red = nearExp.bands.RED ? nearExp.bands.RED.value : 0;
            const amber = nearExp.bands.AMBER ? nearExp.bands.AMBER.value : 0;
            document.getElementById('kpi2-sub').textContent = `RED (≤30d): ₹${red.toFixed(2)} | AMBER (≤90d): ₹${amber.toFixed(2)}`;
        }

        const reorder = data.kpi8_reorder_alerts;
        if (reorder) {
            document.getElementById('kpi8-count').textContent = `${reorder.count} items`;
            const rTable = document.getElementById('kpi8-table-body');
            rTable.innerHTML = '';
            if (reorder.data.length === 0) {
                rTable.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#16a34a;">Inventory healthy.</td></tr>';
            } else {
                reorder.data.slice(0, 10).forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${item.brand_name}</strong></td>
                        <td style="color:#dc2626; font-weight:600;">${item.on_hand}</td>
                        <td>${item.reorder_level}</td>
                    `;
                    rTable.appendChild(tr);
                });
            }
        }

        const today = data.today_summary;
        if (today) {
            document.getElementById('today-rev-val').textContent = `₹${today.today_revenue.toFixed(2)}`;
            document.getElementById('today-bills-val').textContent = `${today.today_bills} completed sales today`;
        }

        // KPI 1: Expiry loss
        const kpi1Table = document.getElementById('kpi1-table-body');
        kpi1Table.innerHTML = '';
        if (data.kpi1_expiry_loss_monthly && data.kpi1_expiry_loss_monthly.data.length > 0) {
            data.kpi1_expiry_loss_monthly.data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${row.month}</strong></td>
                    <td>${row.units_lost} units</td>
                    <td style="color:#dc2626; font-weight:600;">₹${row.loss_value.toFixed(2)}</td>
                `;
                kpi1Table.appendChild(tr);
            });
        } else {
            kpi1Table.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;">No expired lots recorded.</td></tr>';
        }

        // KPI 6: Daily sales
        const kpi6Table = document.getElementById('kpi6-table-body');
        kpi6Table.innerHTML = '';
        if (data.kpi6_daily_revenue && data.kpi6_daily_revenue.data.length > 0) {
            data.kpi6_daily_revenue.data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.date}</td>
                    <td>${row.units} units</td>
                    <td style="font-weight:600; color:#0284c7;">₹${row.revenue.toFixed(2)}</td>
                `;
                kpi6Table.appendChild(tr);
            });
        } else {
            kpi6Table.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;">No recent sales.</td></tr>';
        }

        // KPI 4: Fast movers
        const kpi4Table = document.getElementById('kpi4-table-body');
        kpi4Table.innerHTML = '';
        if (data.kpi4_fast_movers && data.kpi4_fast_movers.data.length > 0) {
            data.kpi4_fast_movers.data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${row.brand_name}</strong> (${row.strength})</td>
                    <td><span class="badge badge-green">${row.units_sold}</span></td>
                    <td>₹${row.revenue.toFixed(2)}</td>
                `;
                kpi4Table.appendChild(tr);
            });
        } else {
            kpi4Table.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;">No 30-day velocity data.</td></tr>';
        }

        // KPI 5: Slow movers
        const kpi5Table = document.getElementById('kpi5-table-body');
        kpi5Table.innerHTML = '';
        if (data.kpi5_slow_movers && data.kpi5_slow_movers.data.length > 0) {
            data.kpi5_slow_movers.data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${row.brand_name}</strong> (${row.strength})</td>
                    <td>${row.on_hand}</td>
                    <td style="color:#d97706; font-weight:600;">₹${row.tied_up_capital.toFixed(2)}</td>
                    <td>${row.units_sold_30d}</td>
                `;
                kpi5Table.appendChild(tr);
            });
        } else {
            kpi5Table.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#64748b;">No slow movers identified.</td></tr>';
        }

        // KPI 7: Supplier returns
        const kpi7Table = document.getElementById('kpi7-table-body');
        kpi7Table.innerHTML = '';
        if (data.kpi7_supplier_returns && data.kpi7_supplier_returns.data.length > 0) {
            data.kpi7_supplier_returns.data.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${row.supplier_name}</strong></td>
                    <td>${row.units_returned} units</td>
                    <td style="color:#16a34a; font-weight:600;">₹${row.total_credit.toFixed(2)}</td>
                `;
                kpi7Table.appendChild(tr);
            });
        } else {
            kpi7Table.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;">No supplier returns recorded.</td></tr>';
        }

        // KPI 9: Cashier & Payments
        const kpi9Table = document.getElementById('kpi9-table-body');
        kpi9Table.innerHTML = '';
        if (data.kpi9_cashier_and_payments && data.kpi9_cashier_and_payments.cashiers.length > 0) {
            data.kpi9_cashier_and_payments.cashiers.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${row.cashier_name}</strong></td>
                    <td>${row.bill_count} bills</td>
                    <td>₹${row.revenue.toFixed(2)}</td>
                `;
                kpi9Table.appendChild(tr);
            });
        } else {
            kpi9Table.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;">No cashier sales recorded.</td></tr>';
        }
    }
});

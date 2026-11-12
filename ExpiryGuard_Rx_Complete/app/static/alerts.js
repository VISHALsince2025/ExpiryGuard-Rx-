// app/static/alerts.js - Expiry Alerts & Risk Management Handler
document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('alerts-table-body');
    const filterButtons = document.querySelectorAll('#band-filter-group button');
    const returnModal = document.getElementById('raise-return-modal');
    const returnForm = document.getElementById('raise-return-form');

    let currentBand = '';
    let alertsData = [];

    init();

    async function init() {
        await loadAlerts();

        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active-filter'));
                btn.classList.add('active-filter');
                currentBand = btn.dataset.band;
                loadAlerts(currentBand);
            });
        });

        if (returnForm) {
            returnForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const batchId = parseInt(document.getElementById('return-batch-id').value);
                const qty = parseInt(document.getElementById('return-qty').value);
                const reason = document.getElementById('return-reason').value;

                try {
                    const res = await fetch('/returns', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ batch_id: batchId, return_qty: qty, reason: reason })
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        showAlert(err.detail || 'Failed to raise return', 'danger');
                        return;
                    }

                    returnModal.classList.remove('active');
                    showAlert('Supplier return created and submitted for pharmacist approval.', 'success');
                    loadAlerts(currentBand);
                } catch (err) {
                    showAlert('Server communication error', 'danger');
                }
            });
        }
    }

    async function loadAlerts(band = '') {
        try {
            const url = band ? `/alerts/expiry?band=${encodeURIComponent(band)}` : '/alerts/expiry';
            const res = await fetch(url);
            if (!res.ok) return;
            alertsData = await res.json();
            renderTable();
        } catch (err) {
            console.error("Failed to load alerts", err);
        }
    }

    function renderTable() {
        tableBody.innerHTML = '';
        if (alertsData.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: #64748b;">No batches found in this category.</td></tr>`;
            return;
        }

        alertsData.forEach(item => {
            let badgeClass = 'badge-green';
            if (item.expiry_band === 'EXPIRED') badgeClass = 'badge-expired';
            else if (item.expiry_band === 'RED') badgeClass = 'badge-red';
            else if (item.expiry_band === 'AMBER') badgeClass = 'badge-amber';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.brand_name}</strong> (${item.strength})</td>
                <td><span class="badge badge-neutral">${item.batch_number}</span></td>
                <td>${item.expiry_date}</td>
                <td>
                    <span style="font-weight: 600; color: ${item.days_left <= 0 ? '#b91c1c' : (item.days_left <= 30 ? '#dc2626' : '#0f172a')}">
                        ${item.days_left <= 0 ? 'EXPIRED' : item.days_left + ' days'}
                    </span>
                </td>
                <td>${item.qty_on_hand}</td>
                <td>₹${item.stock_cost_value.toFixed(2)}</td>
                <td><span class="badge ${badgeClass}">${item.expiry_band}</span></td>
                <td>${item.predicted_daily_units ? item.predicted_daily_units.toFixed(1) + ' u/day' : '<span style="color:#94a3b8;">N/A</span>'}</td>
                <td style="font-weight:600; color: ${item.units_at_risk > 0 ? '#dc2626' : '#16a34a'}">
                    ${item.units_at_risk}
                </td>
                <td style="font-weight:600; color: ${item.value_at_risk > 0 ? '#dc2626' : '#16a34a'}">
                    ₹${item.value_at_risk.toFixed(2)}
                </td>
                <td>
                    <button type="button" class="btn btn-sm btn-secondary btn-raise-return" data-id="${item.batch_id}">Return</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Wire return buttons
        document.querySelectorAll('.btn-raise-return').forEach(btn => {
            btn.addEventListener('click', () => {
                const bId = parseInt(btn.dataset.id);
                const batch = alertsData.find(x => x.batch_id === bId);
                if (batch) {
                    document.getElementById('return-batch-id').value = batch.batch_id;
                    document.getElementById('return-batch-num').textContent = batch.batch_number;
                    document.getElementById('return-med-name').textContent = batch.brand_name;
                    document.getElementById('return-max-qty').textContent = batch.qty_on_hand;
                    document.getElementById('return-qty').max = batch.qty_on_hand;
                    document.getElementById('return-qty').value = batch.units_at_risk > 0 ? batch.units_at_risk : batch.qty_on_hand;
                    returnModal.classList.add('active');
                }
            });
        });
    }
});

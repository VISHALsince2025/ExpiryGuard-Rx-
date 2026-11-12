// app/static/audit.js - Audit Trail Filtering & Display
document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('audit-table-body');
    const filterForm = document.getElementById('audit-filter-form');

    init();

    async function init() {
        await loadAudit();

        if (filterForm) {
            filterForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const table = document.getElementById('filter-table').value;
                const action = document.getElementById('filter-action').value.trim();
                const from = document.getElementById('filter-from').value;
                const to = document.getElementById('filter-to').value;
                loadAudit({ table, action, from, to });
            });
        }
    }

    async function loadAudit(params = {}) {
        try {
            const query = new URLSearchParams();
            if (params.table) query.set('table', params.table);
            if (params.action) query.set('action', params.action);
            if (params.from) query.set('from_date', params.from);
            if (params.to) query.set('to_date', params.to);
            query.set('limit', '100');

            const res = await fetch(`/audit?${query.toString()}`);
            if (!res.ok) return;
            const logs = await res.json();
            renderTable(logs);
        } catch (err) {
            console.error("Failed to load audit logs", err);
        }
    }

    function renderTable(logs) {
        tableBody.innerHTML = '';
        if (logs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #64748b;">No audit records match the criteria.</td></tr>`;
            return;
        }

        logs.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${l.audit_id}</td>
                <td style="font-size:0.75rem; color:#475569;">${l.event_time.slice(0, 19)}</td>
                <td><strong>${l.username}</strong><br><small style="color:#64748b;">${l.full_name}</small></td>
                <td><span class="badge badge-neutral">${l.action}</span></td>
                <td><code>${l.table_name}</code></td>
                <td>${l.record_id || '-'}</td>
                <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.75rem;" title="${l.old_value || ''}">${l.old_value || '-'}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.75rem;" title="${l.new_value || ''}">${l.new_value || '-'}</td>
                <td style="font-size:0.75rem; color:#64748b;">${l.ip_address || 'internal'}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
});

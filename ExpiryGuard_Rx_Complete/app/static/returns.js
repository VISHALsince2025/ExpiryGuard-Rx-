// app/static/returns.js - Supplier Returns Handler
document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('returns-table-body');
    const creditModal = document.getElementById('credit-note-modal');
    const creditForm = document.getElementById('credit-note-form');

    let returnsList = [];

    init();

    async function init() {
        await loadReturns();

        if (creditForm) {
            creditForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('credit-return-id').value;
                const noteNo = document.getElementById('credit-note-no').value.trim();
                const amount = parseFloat(document.getElementById('credit-amount').value);

                try {
                    const res = await fetch(`/returns/${id}/credit`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ credit_note_no: noteNo, credit_amount: amount })
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        showAlert(err.detail || 'Failed to record credit note', 'danger');
                        return;
                    }
                    creditModal.classList.remove('active');
                    showAlert('Credit note recorded successfully!', 'success');
                    loadReturns();
                } catch (err) {
                    showAlert('Server communication error', 'danger');
                }
            });
        }
    }

    async function loadReturns() {
        try {
            const res = await fetch('/returns');
            if (!res.ok) return;
            returnsList = await res.json();
            renderTable();
        } catch (err) {
            console.error("Failed to load returns", err);
        }
    }

    function renderTable() {
        tableBody.innerHTML = '';
        if (returnsList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: #64748b;">No supplier returns recorded yet.</td></tr>`;
            return;
        }

        returnsList.forEach(r => {
            let statusBadge = 'badge-amber';
            if (r.status === 'APPROVED') statusBadge = 'badge-green';
            else if (r.status === 'CREDITED') statusBadge = 'badge-neutral';

            let actionHtml = '';
            if (r.status === 'PENDING') {
                actionHtml = `<button type="button" class="btn btn-sm btn-primary btn-approve-return" data-id="${r.return_id}">Approve (Deduct Stock)</button>`;
            } else if (r.status === 'APPROVED') {
                actionHtml = `<button type="button" class="btn btn-sm btn-secondary btn-credit-return" data-id="${r.return_id}">Record Credit Note</button>`;
            } else {
                actionHtml = `<span style="color:#16a34a; font-weight:600;">₹${r.credit_amount ? r.credit_amount.toFixed(2) : '0.00'}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${r.return_id}</td>
                <td><strong>${r.brand_name}</strong> (${r.strength})</td>
                <td><span class="badge badge-neutral">${r.batch_number}</span></td>
                <td>${r.supplier_name}</td>
                <td>${r.return_qty}</td>
                <td>${r.reason}</td>
                <td><span class="badge ${statusBadge}">${r.status}</span></td>
                <td>${r.created_by_name}</td>
                <td>${r.approved_by_name || '-'}</td>
                <td>${r.credit_note_no ? r.credit_note_no : '-'}</td>
                <td>${actionHtml}</td>
            `;
            tableBody.appendChild(tr);
        });

        // Wire approve buttons
        document.querySelectorAll('.btn-approve-return').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                btn.disabled = true;
                btn.textContent = 'Processing...';

                try {
                    const res = await fetch(`/returns/${id}/approve`, { method: 'POST' });
                    if (!res.ok) {
                        const err = await res.json();
                        showAlert(err.detail || 'Approval failed', 'danger');
                        btn.disabled = false;
                        btn.textContent = 'Approve (Deduct Stock)';
                        return;
                    }
                    showAlert(`Return #${id} approved! Inventory reduced and audit logged.`, 'success');
                    loadReturns();
                } catch (err) {
                    showAlert('Server communication error', 'danger');
                    btn.disabled = false;
                }
            });
        });

        // Wire credit note buttons
        document.querySelectorAll('.btn-credit-return').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                document.getElementById('credit-return-id').value = id;
                document.getElementById('credit-note-no').value = '';
                document.getElementById('credit-amount').value = '';
                creditModal.classList.add('active');
            });
        });
    }
});

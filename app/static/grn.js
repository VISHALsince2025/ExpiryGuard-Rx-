// app/static/grn.js - Stock Receiving & GRN Management Engine
document.addEventListener('DOMContentLoaded', () => {
    const supplierSelect = document.getElementById('grn-supplier-select');
    const invoiceNumInput = document.getElementById('grn-invoice-number');
    const invoiceDateInput = document.getElementById('grn-invoice-date');
    const batchRowsBody = document.getElementById('grn-batches-body');
    const addRowBtn = document.getElementById('btn-add-batch-row');
    const submitGrnBtn = document.getElementById('btn-submit-grn');

    // Upload modal elements
    const uploadModal = document.getElementById('upload-modal');
    const uploadForm = document.getElementById('upload-form');
    const uploadGrnIdEl = document.getElementById('upload-grn-id');
    const invoiceFileInput = document.getElementById('invoice-file-input');
    const uploadStatusEl = document.getElementById('upload-status');

    let availableMedicines = [];
    let activeGrnIdForUpload = null;

    // Load Initial Data
    initGrnPage();

    async function initGrnPage() {
        try {
            // Load Suppliers
            const supRes = await fetch('/suppliers');
            if (supRes.ok) {
                const suppliers = await supRes.json();
                supplierSelect.innerHTML = '<option value="">-- Select Wholesaler --</option>' +
                    suppliers.map(s => `<option value="${s.supplier_id}">${s.supplier_name} (${s.city || 'Local'})</option>`).join('');
            }

            // Load Medicines Master
            const medRes = await fetch('/medicines?limit=200');
            if (medRes.ok) {
                availableMedicines = await medRes.json();
            }

            // Add first initial row
            addBatchRow();

            // Load Recent GRNs
            loadRecentGrns();
        } catch (err) {
            console.error("Initialization error", err);
        }
    }

    function addBatchRow() {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <select class="batch-med-select" style="padding: 0.35rem;" required>
                    <option value="">-- Select Product --</option>
                    ${availableMedicines.map(m => `<option value="${m.medicine_id}">${m.brand_name} (${m.strength})</option>`).join('')}
                </select>
            </td>
            <td>
                <input type="text" class="batch-no-input" placeholder="e.g. B2601" style="padding: 0.35rem;" required maxlength="40">
            </td>
            <td>
                <input type="date" class="batch-exp-input" style="padding: 0.35rem;" required>
            </td>
            <td>
                <input type="number" class="batch-qty-input" min="1" max="100000" placeholder="Qty" style="width: 80px; padding: 0.35rem;" required>
            </td>
            <td>
                <input type="number" class="batch-cost-input" min="0" step="0.01" placeholder="₹ Cost" style="width: 90px; padding: 0.35rem;" required>
            </td>
            <td>
                <input type="number" class="batch-sell-input" min="0" step="0.01" placeholder="₹ MRP" style="width: 90px; padding: 0.35rem;" required>
            </td>
            <td>
                <button type="button" class="btn btn-sm btn-danger btn-remove-row">×</button>
            </td>
        `;
        batchRowsBody.appendChild(tr);

        tr.querySelector('.btn-remove-row').addEventListener('click', () => {
            if (batchRowsBody.querySelectorAll('tr').length > 1) {
                tr.remove();
            } else {
                showAlert('A GRN must include at least one batch item.', 'warning');
            }
        });
    }

    if (addRowBtn) {
        addRowBtn.addEventListener('click', addBatchRow);
    }

    // Submit GRN
    if (submitGrnBtn) {
        submitGrnBtn.addEventListener('click', async () => {
            const supplierId = parseInt(supplierSelect.value);
            const invoiceNumber = invoiceNumInput.value.trim();
            const invoiceDate = invoiceDateInput.value;

            if (!supplierId || !invoiceNumber || !invoiceDate) {
                showAlert('Please complete all invoice header fields.', 'warning');
                return;
            }

            const rows = batchRowsBody.querySelectorAll('tr');
            const batches = [];

            for (const r of rows) {
                const medId = parseInt(r.querySelector('.batch-med-select').value);
                const batchNo = r.querySelector('.batch-no-input').value.trim();
                const expDate = r.querySelector('.batch-exp-input').value;
                const qty = parseInt(r.querySelector('.batch-qty-input').value);
                const cost = parseFloat(r.querySelector('.batch-cost-input').value);
                const sell = parseFloat(r.querySelector('.batch-sell-input').value);

                if (!medId || !batchNo || !expDate || isNaN(qty) || isNaN(cost) || isNaN(sell)) {
                    showAlert('Please fill in all columns for every batch row.', 'warning');
                    return;
                }

                batches.push({
                    medicine_id: medId,
                    batch_number: batchNo,
                    expiry_date: expDate,
                    qty: qty,
                    cost_price: cost,
                    selling_price: sell
                });
            }

            submitGrnBtn.disabled = true;
            submitGrnBtn.textContent = 'Recording Transaction...';

            try {
                const res = await fetch('/grn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        supplier_id: supplierId,
                        invoice_number: invoiceNumber,
                        invoice_date: invoiceDate,
                        batches: batches
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    showAlert(err.detail || 'Could not save GRN', 'danger');
                    submitGrnBtn.disabled = false;
                    submitGrnBtn.textContent = 'Submit Stock Received (Save GRN)';
                    return;
                }

                const data = await res.json();
                showAlert(`Stock Received Note #${data.grn_id} successfully created!`, 'success');

                // Prompt invoice upload modal
                activeGrnIdForUpload = data.grn_id;
                uploadGrnIdEl.textContent = data.grn_id;
                uploadStatusEl.innerHTML = '';
                invoiceFileInput.value = '';
                uploadModal.classList.add('active');

                // Reset GRN form
                invoiceNumInput.value = '';
                batchRowsBody.innerHTML = '';
                addBatchRow();
                loadRecentGrns();

            } catch (err) {
                showAlert('Server communication error during GRN processing.', 'danger');
            } finally {
                submitGrnBtn.disabled = false;
                submitGrnBtn.textContent = 'Submit Stock Received (Save GRN)';
            }
        });
    }

    // Invoice Scan Upload Submission
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!activeGrnIdForUpload || !invoiceFileInput.files[0]) {
                showAlert('Please select an invoice document file.', 'warning');
                return;
            }

            const file = invoiceFileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);

            uploadStatusEl.innerHTML = '<span style="color:#0284c7;">Uploading scan to private Azure Blob Storage and Cosmos DB...</span>';

            try {
                const res = await fetch(`/grn/${activeGrnIdForUpload}/invoice`, {
                    method: 'POST',
                    body: formData
                });

                if (!res.ok) {
                    const err = await res.json();
                    uploadStatusEl.innerHTML = `<span style="color:#dc2626;">${err.detail || 'Upload failed'}</span>`;
                    return;
                }

                const data = await res.json();
                uploadStatusEl.innerHTML = `<span style="color:#16a34a;">Upload successful! Recorded in Blob: <strong>${data.blob_name}</strong> and Cosmos DB: <strong>${data.doc_id}</strong></span>`;
                loadRecentGrns();

                setTimeout(() => {
                    uploadModal.classList.remove('active');
                }, 2000);

            } catch (err) {
                uploadStatusEl.innerHTML = '<span style="color:#dc2626;">Network failure during upload.</span>';
            }
        });
    }

    async function loadRecentGrns() {
        const tableBody = document.getElementById('recent-grn-body');
        if (!tableBody) return;

        try {
            const res = await fetch('/grn');
            if (!res.ok) return;
            const list = await res.json();
            tableBody.innerHTML = '';

            list.forEach(g => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>#${g.grn_id}</strong></td>
                    <td>${g.supplier_name}</td>
                    <td>${g.invoice_number}</td>
                    <td>${g.invoice_date}</td>
                    <td>${g.batch_count} lots (${g.total_units} units)</td>
                    <td>${g.received_by_name}</td>
                    <td>
                        ${g.invoice_blob ? 
                            `<button type="button" class="btn btn-sm btn-secondary btn-view-scan" data-id="${g.grn_id}">View Scan (SAS)</button>` : 
                            `<button type="button" class="btn btn-sm btn-secondary btn-upload-scan" data-id="${g.grn_id}">Upload Scan</button>`
                        }
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            // Wire view scan buttons (short SAS link)
            document.querySelectorAll('.btn-view-scan').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    try {
                        const res = await fetch(`/grn/${id}/invoice-link`);
                        if (res.ok) {
                            const data = await res.json();
                            window.open(data.url, '_blank');
                        } else {
                            showAlert('Could not generate temporary access link.', 'danger');
                        }
                    } catch (err) {
                        showAlert('Error retrieving invoice link.', 'danger');
                    }
                });
            });

            // Wire upload scan buttons for existing records
            document.querySelectorAll('.btn-upload-scan').forEach(btn => {
                btn.addEventListener('click', () => {
                    activeGrnIdForUpload = btn.dataset.id;
                    uploadGrnIdEl.textContent = activeGrnIdForUpload;
                    uploadStatusEl.innerHTML = '';
                    invoiceFileInput.value = '';
                    uploadModal.classList.add('active');
                });
            });

        } catch (err) {
            console.error("Failed to load recent GRNs", err);
        }
    }
});

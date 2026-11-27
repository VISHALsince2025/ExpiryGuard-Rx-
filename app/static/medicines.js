// app/static/medicines.js - Drug Master Directory Handler
document.addEventListener('DOMContentLoaded', () => {
    const searchBox = document.getElementById('search-med-box');
    const medTableBody = document.getElementById('med-list-body');
    const openAddBtn = document.getElementById('btn-open-add-med');
    const addModal = document.getElementById('add-med-modal');
    const addForm = document.getElementById('add-med-form');
    const editModal = document.getElementById('edit-med-modal');
    const editForm = document.getElementById('edit-med-form');

    const newCategorySelect = document.getElementById('new-category');
    const editCategorySelect = document.getElementById('edit-category');

    let categoriesCache = [];
    let medicinesCache = [];

    init();

    async function init() {
        window.loadMedicines = loadMedicines;
        await loadCategories();
        await loadMedicines();

        if (searchBox) {
            let debounce;
            searchBox.addEventListener('input', () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    loadMedicines(searchBox.value.trim());
                }, 250);
            });
        }

        if (openAddBtn) {
            openAddBtn.addEventListener('click', () => {
                addForm.reset();
                addModal.classList.add('active');
            });
        }

        if (addForm) {
            addForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    brand_name: document.getElementById('new-brand').value.trim(),
                    generic_name: document.getElementById('new-generic').value.trim(),
                    strength: document.getElementById('new-strength').value.trim(),
                    dosage_form: document.getElementById('new-dosage').value.trim(),
                    category_id: parseInt(newCategorySelect.value),
                    reorder_level: parseInt(document.getElementById('new-reorder').value),
                    requires_prescription: document.getElementById('new-rx').checked
                };

                try {
                    const res = await fetch('/medicines', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        showAlert(err.detail || 'Failed to create medicine', 'danger');
                        return;
                    }
                    addModal.classList.remove('active');
                    showAlert('Medicine created successfully!', 'success');
                    loadMedicines();
                } catch (err) {
                    showAlert('Error communicating with server', 'danger');
                }
            });
        }

        if (editForm) {
            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('edit-med-id').value;
                const payload = {
                    brand_name: document.getElementById('edit-brand').value.trim(),
                    generic_name: document.getElementById('edit-generic').value.trim(),
                    strength: document.getElementById('edit-strength').value.trim(),
                    dosage_form: document.getElementById('edit-dosage').value.trim(),
                    category_id: parseInt(editCategorySelect.value),
                    reorder_level: parseInt(document.getElementById('edit-reorder').value),
                    requires_prescription: document.getElementById('edit-rx').checked,
                    is_active: document.getElementById('edit-active').checked
                };

                try {
                    const res = await fetch(`/medicines/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        showAlert(err.detail || 'Failed to update medicine', 'danger');
                        return;
                    }
                    editModal.classList.remove('active');
                    showAlert('Medicine updated successfully!', 'success');
                    loadMedicines();
                } catch (err) {
                    showAlert('Error updating medicine', 'danger');
                }
            });
        }
    }

    async function loadCategories() {
        try {
            const res = await fetch('/medicines/categories');
            if (res.ok) {
                categoriesCache = await res.json();
                const optionsHtml = '<option value="">-- Select Category --</option>' +
                    categoriesCache.map(c => `<option value="${c.category_id}">${c.category_name}</option>`).join('');
                if (newCategorySelect) newCategorySelect.innerHTML = optionsHtml;
                if (editCategorySelect) editCategorySelect.innerHTML = optionsHtml;
            }
        } catch (err) {
            console.error("Failed to load categories", err);
        }
    }

    async function loadMedicines(query = '') {
        try {
            const res = await fetch(`/medicines?q=${encodeURIComponent(query)}&limit=100`);
            if (!res.ok) return;
            medicinesCache = await res.json();
            renderTable();
        } catch (err) {
            console.error("Failed to load medicines", err);
        }
    }

    function renderTable() {
        medTableBody.innerHTML = '';
        if (medicinesCache.length === 0) {
            medTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: #64748b;">No medicines matched query.</td></tr>`;
            return;
        }

        medicinesCache.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${m.medicine_id}</td>
                <td><strong>${m.brand_name}</strong></td>
                <td>${m.generic_name}</td>
                <td>${m.strength}</td>
                <td>${m.dosage_form}</td>
                <td>${m.category_name}</td>
                <td>
                    <span class="badge ${m.total_stock > m.reorder_level ? 'badge-green' : (m.total_stock > 0 ? 'badge-amber' : 'badge-red')}">
                        ${m.total_stock} units
                    </span>
                    ${m.total_stock <= m.reorder_level ? '<span class="badge badge-amber" style="margin-left:4px; font-size:0.7rem;">Low</span>' : ''}
                </td>
                <td>${m.reorder_level}</td>
                <td>
                    ${m.requires_prescription ? '<span class="badge badge-amber">Rx</span>' : '<span style="color:#94a3b8;">No</span>'}
                </td>
                <td>
                    ${m.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-expired">Disabled</span>'}
                </td>
                <td>
                    <div style="display:flex; gap:0.35rem; align-items:center;">
                        <button type="button" class="btn btn-sm btn-secondary btn-edit-med" data-id="${m.medicine_id}">Edit</button>
                        <button type="button" class="btn btn-sm btn-secondary btn-qr-label" data-id="${m.medicine_id}" title="Generate Thermal Scannable QR Label">🏷️ QR</button>
                        ${m.total_stock <= m.reorder_level ? `<button type="button" class="btn btn-sm btn-primary btn-quick-reorder" data-id="${m.medicine_id}" data-name="${escapeHtml(m.brand_name)}" style="background:#0D9488; padding:0.25rem 0.5rem; font-size:0.75rem;">⚡ Reorder</button>` : ''}
                    </div>
                </td>
            `;
            medTableBody.appendChild(tr);
        });

        // Wire edit buttons
        document.querySelectorAll('.btn-edit-med').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const med = medicinesCache.find(x => x.medicine_id === id);
                if (med) openEditModal(med);
            });
        });

        // Wire QR Label buttons
        const modalQRLabel = document.getElementById('modalQRLabel');
        const qrLabelContainer = document.getElementById('qrLabelContainer');
        const btnPrintQR = document.getElementById('btnPrintQRLabel');

        if (btnPrintQR) {
            btnPrintQR.onclick = () => window.print();
        }

        document.querySelectorAll('.btn-qr-label').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const med = medicinesCache.find(x => x.medicine_id === id);
                if (!med) return;

                const qrPayload = JSON.stringify({
                    brand_name: med.brand_name,
                    generic_name: med.generic_name,
                    strength: med.strength,
                    dosage_form: med.dosage_form,
                    category_id: med.category_id || 1,
                    batch_number: `LOT-${med.medicine_id}X`,
                    expiry_date: "2027-12-31",
                    quantity: 50,
                    cost_price: 20.0,
                    selling_price: 35.0
                });

                const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrPayload)}`;

                if (qrLabelContainer) {
                    qrLabelContainer.innerHTML = `
                        <div class="thermal-label-container">
                            <div class="thermal-label-header">
                                <strong style="font-size:0.95rem; letter-spacing:0.5px;">RX MEDICAL STORE</strong>
                                <div style="font-size:0.65rem; color:#64748B;">BATCH INVENTORY LABEL &bull; DL: UP-2024-8841</div>
                            </div>
                            <div class="thermal-label-body">
                                <img src="${qrImgUrl}" alt="Medicine QR" class="thermal-label-qr">
                                <div class="thermal-label-meta">
                                    <div style="font-size:0.95rem; font-weight:bold; color:#0F172A;">${escapeHtml(med.brand_name)}</div>
                                    <div style="font-size:0.75rem; color:#475569;">${escapeHtml(med.generic_name)}</div>
                                    <div style="margin-top:4px;"><strong>Strength:</strong> ${escapeHtml(med.strength)}</div>
                                    <div><strong>Dosage:</strong> ${escapeHtml(med.dosage_form)}</div>
                                    <div><strong>Lot:</strong> <code>LOT-${med.medicine_id}X</code></div>
                                    <div><strong>Exp Date:</strong> 12/2027</div>
                                    <div><strong>Statutory:</strong> ${med.requires_prescription ? 'Schedule H (Rx)' : 'OTC Drug'}</div>
                                </div>
                            </div>
                            <div style="border-top:1px dashed #94A3B8; margin-top:8px; padding-top:4px; font-size:0.65rem; text-align:center; color:#64748B;">
                                SCAN WITH AI QR READER TO AUTO-INWARD INTO PHARMACY DATABASE
                            </div>
                        </div>
                    `;
                }

                if (modalQRLabel) modalQRLabel.classList.add('active');
            });
        });

        // Wire 1-Click Quick Reorder
        document.querySelectorAll('.btn-quick-reorder').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.id);
                const name = btn.dataset.name;
                const confirmReorder = confirm(`Generate instant stock reorder of 50 units for '${name}'?`);
                if (!confirmReorder) return;

                btn.disabled = true;
                btn.textContent = 'Ordering...';

                try {
                    const res = await fetch('/api/scanning/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            brand_name: name,
                            generic_name: name,
                            strength: "Standard",
                            dosage_form: "Tablet",
                            category_id: 1,
                            batch_number: `REORD-${Date.now().toString().slice(-4)}`,
                            expiry_date: "2028-06-30",
                            quantity: 50,
                            cost_price: 18.0,
                            selling_price: 28.0,
                            supplier_id: 1,
                            source: 'QUICK_REORDER'
                        })
                    });
                    const json = await res.json();
                    if (res.ok && json.status === 'success') {
                        showAlert(`Reordered 50 units of ${name}! Total stock: ${json.data.total_available_stock} units.`, 'success');
                        loadMedicines();
                    } else {
                        showAlert('Reorder failed: ' + (json.detail || json.message), 'danger');
                    }
                } catch (e) {
                    showAlert('Error placing quick reorder: ' + e.message, 'danger');
                } finally {
                    btn.disabled = false;
                    btn.textContent = '⚡ Reorder';
                }
            });
        });
    }

    function openEditModal(med) {
        document.getElementById('edit-med-id').value = med.medicine_id;
        document.getElementById('edit-brand').value = med.brand_name;
        document.getElementById('edit-generic').value = med.generic_name;
        document.getElementById('edit-strength').value = med.strength;
        document.getElementById('edit-dosage').value = med.dosage_form;
        document.getElementById('edit-category').value = med.category_id;
        document.getElementById('edit-reorder').value = med.reorder_level;
        document.getElementById('edit-rx').checked = med.requires_prescription;
        document.getElementById('edit-active').checked = med.is_active;
        editModal.classList.add('active');
    }
});

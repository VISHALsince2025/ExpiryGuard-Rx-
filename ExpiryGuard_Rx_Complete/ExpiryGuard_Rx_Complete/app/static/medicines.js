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
                    <span class="badge ${m.total_stock > 0 ? 'badge-green' : 'badge-red'}">
                        ${m.total_stock} units
                    </span>
                </td>
                <td>${m.reorder_level}</td>
                <td>
                    ${m.requires_prescription ? '<span class="badge badge-amber">Rx</span>' : '<span style="color:#94a3b8;">No</span>'}
                </td>
                <td>
                    ${m.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-expired">Disabled</span>'}
                </td>
                <td>
                    <button type="button" class="btn btn-sm btn-secondary btn-edit-med" data-id="${m.medicine_id}">Edit</button>
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

// app/static/users.js - User Administration Handler
document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('users-table-body');
    const openCreateBtn = document.getElementById('btn-open-create-user');
    const createModal = document.getElementById('create-user-modal');
    const createForm = document.getElementById('create-user-form');
    const editModal = document.getElementById('edit-user-modal');
    const editForm = document.getElementById('edit-user-form');

    let usersList = [];

    init();

    async function init() {
        await loadUsers();

        if (openCreateBtn) {
            openCreateBtn.addEventListener('click', () => {
                createForm.reset();
                createModal.classList.add('active');
            });
        }

        if (createForm) {
            createForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    username: document.getElementById('new-username').value.trim(),
                    full_name: document.getElementById('new-fullname').value.trim(),
                    email: document.getElementById('new-email').value.trim(),
                    password: document.getElementById('new-password').value,
                    role_id: parseInt(document.getElementById('new-role').value)
                };

                try {
                    const res = await fetch('/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        showAlert(err.detail || 'Failed to create user', 'danger');
                        return;
                    }
                    createModal.classList.remove('active');
                    showAlert('Staff user account created successfully!', 'success');
                    loadUsers();
                } catch (err) {
                    showAlert('Server communication error', 'danger');
                }
            });
        }

        if (editForm) {
            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('edit-user-id').value;
                const payload = {
                    role_id: parseInt(document.getElementById('edit-role-select').value),
                    is_active: document.getElementById('edit-is-active').checked,
                    unlock: document.getElementById('edit-unlock').checked
                };

                try {
                    const res = await fetch(`/users/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        showAlert(err.detail || 'Failed to update user', 'danger');
                        return;
                    }
                    editModal.classList.remove('active');
                    showAlert('User access updated successfully!', 'success');
                    loadUsers();
                } catch (err) {
                    showAlert('Server communication error', 'danger');
                }
            });
        }
    }

    async function loadUsers() {
        try {
            const res = await fetch('/users');
            if (!res.ok) return;
            usersList = await res.json();
            renderTable();
        } catch (err) {
            console.error("Failed to load users", err);
        }
    }

    function renderTable() {
        tableBody.innerHTML = '';
        if (usersList.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b;">No users found.</td></tr>`;
            return;
        }

        usersList.forEach(u => {
            const tr = document.createElement('tr');
            const isLocked = u.locked_until !== null;
            tr.innerHTML = `
                <td>#${u.user_id}</td>
                <td><strong>${u.username}</strong></td>
                <td>${u.full_name}</td>
                <td>${u.email}</td>
                <td><span class="badge badge-neutral">${u.role_name}</span></td>
                <td>${u.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-expired">Disabled</span>'}</td>
                <td>
                    ${isLocked ? `<span class="badge badge-red" title="Locked until ${u.locked_until}">LOCKED (${u.failed_attempts} fails)</span>` : '<span style="color:#16a34a;">Unlocked</span>'}
                </td>
                <td>
                    <button type="button" class="btn btn-sm btn-secondary btn-edit-user" data-id="${u.user_id}">Modify</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Wire modify buttons
        document.querySelectorAll('.btn-edit-user').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const user = usersList.find(x => x.user_id === id);
                if (user) openEditModal(user);
            });
        });
    }

    function openEditModal(user) {
        document.getElementById('edit-user-id').value = user.user_id;
        document.getElementById('edit-user-username').textContent = `${user.username} (${user.full_name})`;
        document.getElementById('edit-role-select').value = user.role_id;
        document.getElementById('edit-is-active').checked = user.is_active;

        const unlockContainer = document.getElementById('unlock-container');
        const unlockCheck = document.getElementById('edit-unlock');
        if (user.locked_until) {
            unlockContainer.style.display = 'block';
            unlockCheck.checked = true;
        } else {
            unlockContainer.style.display = 'none';
            unlockCheck.checked = false;
        }

        editModal.classList.add('active');
    }
});

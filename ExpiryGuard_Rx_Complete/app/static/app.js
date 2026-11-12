// app/static/app.js - Global Enterprise RX Medical Store / ExpiryGuard Rx JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // 1. Sidebar Collapse State (Desktop)
    const sidebar = document.getElementById('appSidebar');
    const collapseBtn = document.getElementById('btnSidebarCollapse');

    if (sidebar && collapseBtn) {
        // Restore saved preference
        const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
        }

        collapseBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const state = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebar_collapsed', state);
        });
    }

    // 2. Mobile Drawer Navigation
    const mobileMenuBtn = document.getElementById('btnMobileNav');
    const mobileCloseBtn = document.getElementById('sidebarCloseMobile');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (mobileMenuBtn && sidebar && backdrop) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.add('mobile-open');
            backdrop.classList.add('active');
        });

        const closeMobileNav = () => {
            sidebar.classList.remove('mobile-open');
            backdrop.classList.remove('active');
        };

        if (mobileCloseBtn) mobileCloseBtn.addEventListener('click', closeMobileNav);
        backdrop.addEventListener('click', closeMobileNav);
    }

    // 3. Modal dismissal handlers
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        });
    });

    // 4. Logout form submission helper
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch('/auth/logout', { method: 'POST' });
                window.location.href = '/';
            } catch (err) {
                window.location.href = '/';
            }
        });
    }
});

// Utility notification banner
function showAlert(message, type = 'danger') {
    const container = document.getElementById('alert-container');
    if (!container) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.display = 'flex';
    alertDiv.style.alignItems = 'center';
    alertDiv.style.justifyContent = 'space-between';
    alertDiv.innerHTML = `
        <span>${escapeHtmlGlobal(message)}</span>
        <button type="button" style="background:transparent;border:none;cursor:pointer;font-weight:bold;color:inherit;padding:0 4px;" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.innerHTML = '';
    container.appendChild(alertDiv);
    setTimeout(() => {
        if (alertDiv && alertDiv.parentNode) alertDiv.remove();
    }, 6000);
}

function escapeHtmlGlobal(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

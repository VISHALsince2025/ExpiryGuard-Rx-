/**
 * ExpiryGuard Rx — Login Controller
 * Clean, modern authentication behavior conforming to CSP
 * Author Attribution: Built & Crafted by VISHAL
 */

document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePassBtn = document.getElementById('togglePassword');
    const eyeIconOpen = document.getElementById('eyeIconOpen');
    const eyeIconClosed = document.getElementById('eyeIconClosed');
    const loginForm = document.getElementById('loginForm');
    const submitBtn = document.getElementById('submitBtn');
    const demoChips = document.querySelectorAll('.demo-chip');

    // 1. Password Visibility Toggle
    if (togglePassBtn && passwordInput) {
        togglePassBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            if (isPassword) {
                eyeIconOpen.style.display = 'none';
                eyeIconClosed.style.display = 'block';
                togglePassBtn.setAttribute('aria-label', 'Hide password');
            } else {
                eyeIconOpen.style.display = 'block';
                eyeIconClosed.style.display = 'none';
                togglePassBtn.setAttribute('aria-label', 'Show password');
            }
        });
    }

    // 2. Demo Account Role Autofill
    const credentialsMap = {
        'admin': { user: 'admin', pass: 'Admin@123456' },
        'pharmacist': { user: 'pharmacist1', pass: 'Admin@123456' },
        'cashier': { user: 'counter1', pass: 'Admin@123456' },
        'purchase': { user: 'purchase1', pass: 'Admin@123456' },
        'auditor': { user: 'auditor1', pass: 'Admin@123456' }
    };

    demoChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const role = chip.getAttribute('data-role');
            if (credentialsMap[role]) {
                usernameInput.value = credentialsMap[role].user;
                passwordInput.value = credentialsMap[role].pass;
                
                // Visual feedback
                demoChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                
                // Focus submit button
                submitBtn.focus();
            }
        });
    });

    // 3. Form Submit Loading Feedback
    if (loginForm && submitBtn) {
        loginForm.addEventListener('submit', () => {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-icon" style="animation: spin 0.8s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#FFFFFF"></path>
                </svg>
                <span>Authenticating Workspace...</span>
            `;
        });
    }
});

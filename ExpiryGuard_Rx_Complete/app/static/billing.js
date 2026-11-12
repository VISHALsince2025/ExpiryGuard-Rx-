// app/static/billing.js - FEFO Dispensing & Point-of-Sale Engine
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('med-search-input');
    const searchResults = document.getElementById('med-search-results');
    const billItemsTable = document.getElementById('bill-items-body');
    const billTotalEl = document.getElementById('bill-total-amount');
    const billUnitsEl = document.getElementById('bill-total-units');
    const checkoutBtn = document.getElementById('btn-checkout');
    const customerNameInput = document.getElementById('customer-name-input');
    const paymentModeSelect = document.getElementById('payment-mode-select');

    // Prescription modal elements
    const rxModal = document.getElementById('rx-modal');
    const rxForm = document.getElementById('rx-form');
    const rxMedNameEl = document.getElementById('rx-med-name');
    const rxPatientInput = document.getElementById('rx-patient-name');
    const rxDoctorInput = document.getElementById('rx-doctor-name');
    const rxRegInput = document.getElementById('rx-reg-no');

    // Receipt modal elements
    const receiptModal = document.getElementById('receipt-modal');
    const receiptContent = document.getElementById('receipt-content');

    let cart = []; // [{medicine_id, brand_name, strength, quantity, est_price, requires_prescription, rx_data: null}]
    let pendingRxItem = null;

    // 1. Medicine Live Search
    let debounceTimer;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim();
            if (query.length < 2) {
                searchResults.innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/medicines?q=${encodeURIComponent(query)}&limit=10`);
                    if (!res.ok) return;
                    const medicines = await res.json();
                    renderSearchResults(medicines);
                } catch (err) {
                    console.error("Search failed", err);
                }
            }, 250);
        });
    }

    function renderSearchResults(medicines) {
        searchResults.innerHTML = '';
        if (medicines.length === 0) {
            const noRes = document.createElement('div');
            noRes.className = 'search-item';
            noRes.textContent = 'No medicines found';
            searchResults.appendChild(noRes);
            return;
        }

        medicines.forEach(m => {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.style.padding = '0.5rem';
            item.style.borderBottom = '1px solid #e2e8f0';
            item.style.cursor = 'pointer';
            item.innerHTML = `
                <strong>${m.brand_name}</strong> (${m.strength}) - ${m.generic_name}
                <span class="badge ${m.total_stock > 0 ? 'badge-green' : 'badge-red'}" style="float:right;">Stock: ${m.total_stock}</span>
                ${m.requires_prescription ? '<span class="badge badge-amber" style="float:right;margin-right:5px;">Rx Only</span>' : ''}
            `;
            item.addEventListener('click', () => {
                selectMedicine(m);
                searchResults.innerHTML = '';
                searchInput.value = '';
            });
            searchResults.appendChild(item);
        });
    }

    function selectMedicine(m) {
        if (m.total_stock <= 0) {
            showAlert(`Cannot dispense ${m.brand_name}: No active stock on hand.`, 'danger');
            return;
        }

        // Check if item already in cart
        const existing = cart.find(i => i.medicine_id === m.medicine_id);
        if (existing) {
            existing.quantity += 1;
            renderCart();
            return;
        }

        const newItem = {
            medicine_id: m.medicine_id,
            brand_name: m.brand_name,
            strength: m.strength,
            quantity: 1,
            requires_prescription: m.requires_prescription,
            rx_data: null
        };

        if (m.requires_prescription) {
            // Prompt Prescription Details
            pendingRxItem = newItem;
            rxMedNameEl.textContent = `${m.brand_name} (${m.strength})`;
            rxPatientInput.value = '';
            rxDoctorInput.value = '';
            rxRegInput.value = '';
            rxModal.classList.add('active');
        } else {
            cart.push(newItem);
            renderCart();
        }
    }

    if (rxForm) {
        rxForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!pendingRxItem) return;
            pendingRxItem.rx_data = {
                patient_name: rxPatientInput.value.trim(),
                prescriber_name: rxDoctorInput.value.trim(),
                prescriber_reg_no: rxRegInput.value.trim()
            };
            cart.push(pendingRxItem);
            pendingRxItem = null;
            rxModal.classList.remove('active');
            renderCart();
        });
    }

    function renderCart() {
        billItemsTable.innerHTML = '';
        let totalUnits = 0;

        if (cart.length === 0) {
            billItemsTable.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b;">No medicines added to bill yet.</td></tr>`;
            billTotalUnits.textContent = '0';
            billTotalAmount.textContent = '₹0.00';
            return;
        }

        cart.forEach((item, idx) => {
            totalUnits += item.quantity;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${item.brand_name}</strong> (${item.strength})
                    ${item.requires_prescription ? '<br><small style="color:#d97706;">Rx: ' + (item.rx_data ? item.rx_data.patient_name : 'Pending') + '</small>' : ''}
                </td>
                <td style="width: 120px;">
                    <input type="number" min="1" max="500" value="${item.quantity}" class="cart-qty-input" data-idx="${idx}" style="width: 80px; padding: 0.25rem;">
                </td>
                <td><span class="badge badge-neutral">Auto-Allocated (FEFO)</span></td>
                <td>
                    <button type="button" class="btn btn-sm btn-danger cart-remove-btn" data-idx="${idx}">Remove</button>
                </td>
            `;
            billItemsTable.appendChild(tr);
        });

        billUnitsEl.textContent = totalUnits;
        billTotalEl.textContent = '(Calculated upon FEFO batch selection)';

        // Wire quantity change events
        document.querySelectorAll('.cart-qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= 500) {
                    cart[idx].quantity = val;
                    renderCart();
                }
            });
        });

        // Wire remove buttons
        document.querySelectorAll('.cart-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                cart.splice(idx, 1);
                renderCart();
            });
        });
    }

    // 2. Checkout Submission
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', async () => {
            if (cart.length === 0) {
                showAlert('Cart is empty. Please add medicines first.', 'warning');
                return;
            }

            checkoutBtn.disabled = true;
            checkoutBtn.textContent = 'Allocating FEFO Batches...';

            const payload = {
                customer_name: customerNameInput.value.trim() || null,
                payment_mode: paymentModeSelect.value,
                items: cart.map(i => ({ medicine_id: i.medicine_id, quantity: i.quantity }))
            };

            try {
                const res = await fetch('/sales', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const err = await res.json();
                    if (res.status === 409) {
                        showAlert('Dispensing Blocked: Insufficient unexpired stock for requested medicines. Transaction was rolled back.', 'danger');
                    } else {
                        showAlert(err.detail || 'Failed to complete sale.', 'danger');
                    }
                    checkoutBtn.disabled = false;
                    checkoutBtn.textContent = 'Dispense & Generate Bill (FEFO)';
                    return;
                }

                const data = await res.json();
                const saleId = data.sale_id;

                // Record prescriptions if any
                for (const item of cart) {
                    if (item.requires_prescription && item.rx_data) {
                        await fetch(`/sales/${saleId}/prescription`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                medicine_id: item.medicine_id,
                                patient_name: item.rx_data.patient_name,
                                prescriber_name: item.rx_data.prescriber_name,
                                prescriber_reg_no: item.rx_data.prescriber_reg_no
                            })
                        });
                    }
                }

                // Retrieve and display full bill
                const billRes = await fetch(`/sales/${saleId}`);
                if (billRes.ok) {
                    const bill = await billRes.json();
                    renderReceipt(bill);
                }

                // Reset cart
                cart = [];
                customerNameInput.value = '';
                renderCart();
                showAlert(`Sale #${saleId} completed successfully!`, 'success');

            } catch (err) {
                showAlert('Network or server error during sale execution.', 'danger');
            } finally {
                checkoutBtn.disabled = false;
                checkoutBtn.textContent = 'Dispense & Generate Bill (FEFO)';
            }
        });
    }

    function renderReceipt(bill) {
        receiptContent.innerHTML = `
            <div class="receipt">
                <div class="receipt-header">
                    <h3>EXPIRYGUARD RX PHARMACY</h3>
                    <p>Bill #${bill.sale_id} | Date: ${bill.sale_time.slice(0, 19)}</p>
                    <p>Cashier: ${bill.cashier_name} | Payment: <strong>${bill.payment_mode}</strong></p>
                    ${bill.customer_name ? `<p>Customer: ${bill.customer_name}</p>` : ''}
                </div>
                <hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 0.5rem 0;">
                <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse;">
                    <thead>
                        <tr style="text-align: left; border-bottom: 1px solid #cbd5e1;">
                            <th>Item</th>
                            <th>Batch</th>
                            <th>Exp</th>
                            <th style="text-align:right;">Qty</th>
                            <th style="text-align:right;">Rate</th>
                            <th style="text-align:right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bill.items.map(it => `
                            <tr>
                                <td>${it.brand_name}</td>
                                <td><span class="badge badge-neutral">${it.batch_number}</span></td>
                                <td>${it.expiry_date}</td>
                                <td style="text-align:right;">${it.quantity}</td>
                                <td style="text-align:right;">₹${it.unit_price.toFixed(2)}</td>
                                <td style="text-align:right;">₹${it.line_total.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="receipt-total" style="display: flex; justify-content: space-between; margin-top: 0.75rem;">
                    <span>Total Units: ${bill.total_units}</span>
                    <span style="font-size: 1.1rem; color: #0284c7;">Grand Total: ₹${bill.total_amount.toFixed(2)}</span>
                </div>
                ${bill.prescriptions.length > 0 ? `
                    <div style="margin-top: 0.75rem; font-size: 0.75rem; background: #fffbeb; padding: 0.5rem; border: 1px solid #fde68a;">
                        <strong>Prescription Register Recorded:</strong><br>
                        ${bill.prescriptions.map(p => `Patient: ${p.patient_name} | Doctor: ${p.prescriber_name} (Reg: ${p.prescriber_reg_no})`).join('<br>')}
                    </div>
                ` : ''}
            </div>
        `;
        receiptModal.classList.add('active');
    }
});

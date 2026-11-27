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

        // Auto check clinical drug interactions when cart has multiple items
        checkCartClinicalInteractions();

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

    async function checkCartClinicalInteractions() {
        const bar = document.getElementById('cartClinicalSafetyBar');
        if (!bar) return;

        if (cart.length < 2) {
            bar.style.display = 'none';
            return;
        }

        try {
            const medIds = cart.map(i => i.medicine_id);
            const res = await fetch('/api/clinical/check-interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ medicine_ids: medIds })
            });
            if (!res.ok) return;
            const data = await res.json();
            bar.style.display = 'block';

            const dot = document.getElementById('cartSafetyDot');
            const label = document.getElementById('cartSafetyLabel');
            const badge = document.getElementById('cartSafetyBadge');
            const desc = document.getElementById('cartSafetyDesc');

            if (data.overall_risk === 'CRITICAL_WARNING') {
                dot.style.background = '#DC2626';
                label.textContent = 'CRITICAL ADVERSE INTERACTION DETECTED';
                label.style.color = '#DC2626';
                badge.className = 'badge badge-expired';
                badge.textContent = 'HAZARD';
                desc.innerHTML = `<strong style="color:#DC2626;">Contraindicated:</strong> ${escapeHtml(data.clinical_summary)}`;
            } else if (data.overall_risk === 'MODERATE_CAUTION') {
                dot.style.background = '#D97706';
                label.textContent = 'Moderate Clinical Precaution Advised';
                label.style.color = '#D97706';
                badge.className = 'badge badge-amber';
                badge.textContent = 'CAUTION';
                desc.textContent = data.clinical_summary;
            } else {
                dot.style.background = '#10B981';
                label.textContent = 'AI Clinical Safety: Verified';
                label.style.color = '#0F172A';
                badge.className = 'badge badge-green';
                badge.textContent = 'SAFE';
                desc.textContent = 'No adverse pharmacological contraindications found in cart.';
            }
        } catch (e) {
            console.error("Cart interaction check failed", e);
        }
    }

    // Print Receipt Event
    const printReceiptBtn = document.getElementById('btn-print-receipt');
    if (printReceiptBtn) {
        printReceiptBtn.addEventListener('click', () => {
            window.print();
        });
    }

    function renderReceipt(bill) {
        const subtotal = bill.total_amount / 1.12;
        const gst = bill.total_amount - subtotal;
        const cgst = gst / 2;
        const sgst = gst / 2;

        const qrPayload = JSON.stringify({
            bill_id: bill.sale_id,
            date: bill.sale_time.slice(0, 10),
            amount: bill.total_amount,
            units: bill.total_units,
            rx_pharmacy: "RX Medical Store"
        });
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrPayload)}`;

        receiptContent.innerHTML = `
            <div class="tax-invoice-container">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
                    <div>
                        <div class="invoice-brand-title">RX MEDICAL STORE &amp; HEALTHCARE</div>
                        <div class="invoice-reg-meta">
                            DL No: <strong>DL-20B/21B-UP-2024-8841</strong> &bull; GSTIN: <strong>09AAAAA0000A1Z5</strong><br>
                            Station Road, Medical Enclave, Varanasi, UP - 221002<br>
                            Contact: +91 98765 43210 &bull; Licensed Pharmacy Retailer
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <img src="${qrUrl}" alt="Verify QR" style="width:75px; height:75px; border:1px solid #CBD5E1; padding:2px; background:#fff;" onerror="this.style.display='none'">
                        <div style="font-size:0.65rem; color:#64748B;">Digital Verify QR</div>
                    </div>
                </div>

                <div class="invoice-divider"></div>

                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.5rem;">
                    <div>
                        <strong>Tax Invoice / Retail Cash Memo:</strong> #${bill.sale_id}<br>
                        <strong>Date &amp; Time:</strong> ${bill.sale_time.slice(0, 19)} (IST)<br>
                        <strong>Cashier:</strong> ${escapeHtml(bill.cashier_name)}
                    </div>
                    <div style="text-align:right;">
                        <strong>Customer:</strong> ${escapeHtml(bill.customer_name || 'Walk-in Patient')}<br>
                        <strong>Payment Mode:</strong> <span class="badge badge-teal">${bill.payment_mode}</span><br>
                        <strong>Dispensing Engine:</strong> First Expiry, First Out (FEFO)
                    </div>
                </div>

                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Medicine &amp; Strength</th>
                            <th>Batch Lot</th>
                            <th>Expiry</th>
                            <th style="text-align:right;">Qty</th>
                            <th style="text-align:right;">MRP (₹)</th>
                            <th style="text-align:right;">Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bill.items.map((it, idx) => `
                            <tr>
                                <td>${idx + 1}</td>
                                <td><strong>${escapeHtml(it.brand_name)}</strong></td>
                                <td><code>${escapeHtml(it.batch_number)}</code></td>
                                <td style="font-size:0.75rem;">${it.expiry_date}</td>
                                <td style="text-align:right; font-weight:700;">${it.quantity}</td>
                                <td style="text-align:right;">₹${it.unit_price.toFixed(2)}</td>
                                <td style="text-align:right; font-weight:700;">₹${it.line_total.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="invoice-divider"></div>

                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.75rem;">
                    <div style="color:#64748B; font-size:0.75rem;">
                        <div>Total Units Dispensed: <strong>${bill.total_units} units</strong></div>
                        <div>CGST (6%): ₹${cgst.toFixed(2)} | SGST (6%): ₹${sgst.toFixed(2)}</div>
                        <div style="margin-top:0.25rem;">* All prices inclusive of statutory applicable GST.</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.85rem; color:#64748B;">Net Subtotal: ₹${subtotal.toFixed(2)}</div>
                        <div style="font-size:1.25rem; font-weight:800; color:var(--teal-primary); margin-top:2px;">
                            Total Paid: ₹${bill.total_amount.toFixed(2)}
                        </div>
                    </div>
                </div>

                ${bill.prescriptions && bill.prescriptions.length > 0 ? `
                    <div style="margin-top: 0.5rem; font-size: 0.75rem; background: #FFFBEB; padding: 0.5rem 0.75rem; border-radius: 4px; border: 1px solid #FDE68A;">
                        <strong style="color:#B45309;">Statutory Schedule H / Rx Compliance Verified:</strong><br>
                        ${bill.prescriptions.map(p => `Patient: <strong>${escapeHtml(p.patient_name)}</strong> &bull; Prescriber: <strong>${escapeHtml(p.prescriber_name)}</strong> (Reg: ${escapeHtml(p.prescriber_reg_no)})`).join('<br>')}
                    </div>
                ` : ''}

                <div style="text-align:center; font-size:0.72rem; color:#94A3B8; margin-top:0.75rem; border-top:1px dashed #E2E8F0; padding-top:0.5rem;">
                    Thank you for choosing RX Medical Store! For queries, visit www.rxmedical.local &bull; Computer Generated Invoice
                </div>
            </div>
        `;
        receiptModal.classList.add('active');
    }
});

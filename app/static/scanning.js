// app/static/scanning.js - AI Smart Pharmacy Scanning Suite (Voice, QR, Camera OCR)
// Supports live camera preview, photo capture, speech-to-text, QR decoding, and 1-click database commit.

document.addEventListener('DOMContentLoaded', () => {
    initAIScanning();
});

function initAIScanning() {
    const btnVoice = document.getElementById('btnOpenVoiceModal');
    const btnBarcode = document.getElementById('btnOpenBarcodeModal');
    const btnOCR = document.getElementById('btnOpenOCRModal');

    const modalVoice = document.getElementById('modalVoiceEntry');
    const modalBarcode = document.getElementById('modalBarcodeScanner');
    const modalOCR = document.getElementById('modalOCRScanner');

    let qrStream = null;
    let ocrStream = null;

    function stopAllCameraStreams() {
        if (qrStream) {
            qrStream.getTracks().forEach(t => t.stop());
            qrStream = null;
        }
        if (ocrStream) {
            ocrStream.getTracks().forEach(t => t.stop());
            ocrStream = null;
        }
        const qrWrapper = document.getElementById('qrCameraWrapper');
        if (qrWrapper) qrWrapper.style.display = 'none';
        const ocrWrapper = document.getElementById('ocrCameraWrapper');
        if (ocrWrapper) ocrWrapper.style.display = 'none';
    }

    if (btnVoice && modalVoice) {
        btnVoice.addEventListener('click', () => modalVoice.classList.add('active'));
    }
    if (btnBarcode && modalBarcode) {
        btnBarcode.addEventListener('click', () => modalBarcode.classList.add('active'));
    }
    if (btnOCR && modalOCR) {
        btnOCR.addEventListener('click', () => modalOCR.classList.add('active'));
    }

    // Modal Close Buttons
    document.querySelectorAll('.btn-modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-close');
            const m = document.getElementById(modalId);
            if (m) m.classList.remove('active');
            stopAllCameraStreams();
        });
    });

    // Close on backdrop click
    [modalVoice, modalBarcode, modalOCR].forEach(m => {
        if (m) {
            m.addEventListener('click', (e) => {
                if (e.target === m) {
                    m.classList.remove('active');
                    stopAllCameraStreams();
                }
            });
        }
    });

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showAIToast(message, isSuccess = true) {
        const existing = document.querySelector('.ai-toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'ai-toast-notification';
        toast.style.borderLeftColor = isSuccess ? '#10B981' : '#EF4444';
        toast.innerHTML = `
            <div style="font-size:1.25rem;">${isSuccess ? '✓' : '⚠️'}</div>
            <div>
                <div style="font-weight:700; font-size:0.88rem;">${isSuccess ? 'Database Update Successful' : 'Notice'}</div>
                <div style="font-size:0.8rem; color:#CBD5E1; margin-top:2px;">${escapeHtml(message)}</div>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    function notifyDataSaved() {
        if (typeof window.refreshDashboard === 'function') {
            window.refreshDashboard();
        }
        if (typeof window.loadMedicines === 'function') {
            window.loadMedicines();
        }
    }

    // =========================================================================
    // 1. VOICE-BASED RECOGNITION (English / Hindi / Hinglish)
    // =========================================================================
    const btnToggleRecord = document.getElementById('btnToggleRecord');
    const voiceStatusText = document.getElementById('voiceStatusText');
    const voiceTranscriptInput = document.getElementById('voiceTranscriptInput');
    const voiceLangSelect = document.getElementById('voiceLanguageSelect');
    const btnProcessVoice = document.getElementById('btnProcessVoice');
    const btnConfirmVoiceSave = document.getElementById('btnConfirmVoiceSave');

    let recognition = null;
    let isRecording = false;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
        recognition = new SpeechRec();
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            isRecording = true;
            if (btnToggleRecord) btnToggleRecord.classList.add('recording');
            if (voiceStatusText) {
                voiceStatusText.textContent = "Listening... Speak now in English or Hindi";
                voiceStatusText.style.color = "#DC2626";
            }
        };

        recognition.onresult = (event) => {
            let current = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                current += event.results[i][0].transcript;
            }
            if (voiceTranscriptInput) voiceTranscriptInput.value = current;
        };

        recognition.onerror = (e) => {
            isRecording = false;
            if (btnToggleRecord) btnToggleRecord.classList.remove('recording');
            if (voiceStatusText) {
                voiceStatusText.textContent = "Microphone notice: " + (e.error || 'Check input');
                voiceStatusText.style.color = "#D97706";
            }
        };

        recognition.onend = () => {
            isRecording = false;
            if (btnToggleRecord) btnToggleRecord.classList.remove('recording');
            if (voiceStatusText) {
                voiceStatusText.textContent = "Voice input captured. Reviewing transcription...";
                voiceStatusText.style.color = "var(--text-muted)";
            }
            if (voiceTranscriptInput && voiceTranscriptInput.value.trim().length > 5) {
                processVoiceExtraction();
            }
        };
    }

    if (btnToggleRecord) {
        btnToggleRecord.addEventListener('click', () => {
            if (!recognition) {
                alert("Speech recognition is not natively supported in this browser. You can type, paste, or click the demo preset pills below to test!");
                return;
            }
            if (isRecording) {
                recognition.stop();
            } else {
                recognition.lang = voiceLangSelect ? voiceLangSelect.value : 'en-IN';
                recognition.start();
            }
        });
    }

    // Preset Demo Voice Buttons
    document.querySelectorAll('.btn-demo-voice').forEach(pill => {
        pill.addEventListener('click', () => {
            const text = pill.getAttribute('data-text');
            if (voiceTranscriptInput) {
                voiceTranscriptInput.value = text;
                processVoiceExtraction();
            }
        });
    });

    async function processVoiceExtraction() {
        if (!voiceTranscriptInput) return;
        const text = voiceTranscriptInput.value.trim();
        if (!text) {
            alert("Please speak into the microphone or enter a voice transcript first.");
            return;
        }

        if (btnProcessVoice) {
            btnProcessVoice.disabled = true;
            btnProcessVoice.textContent = "Analyzing NLP...";
        }

        try {
            const res = await fetch('/api/scanning/voice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    language: voiceLangSelect ? voiceLangSelect.value : 'en-IN'
                })
            });
            const json = await res.json();
            if (json.status === 'success') {
                const d = json.data;
                const resultBox = document.getElementById('voiceExtractedResult');
                if (resultBox) resultBox.style.display = 'block';

                const inpBrand = document.getElementById('vInpBrand');
                if (inpBrand) inpBrand.value = d.brand_name || '';
                const inpGeneric = document.getElementById('vInpGeneric');
                if (inpGeneric) inpGeneric.value = d.generic_name || d.brand_name || '';
                const inpBatch = document.getElementById('vInpBatch');
                if (inpBatch) inpBatch.value = d.batch_number || '';
                const inpExp = document.getElementById('vInpExp');
                if (inpExp) inpExp.value = d.expiry_date || '';
                const inpQty = document.getElementById('vInpQty');
                if (inpQty) inpQty.value = d.quantity || 50;
                const inpCost = document.getElementById('vInpCost');
                if (inpCost) inpCost.value = d.purchase_price ? d.purchase_price.toFixed(2) : '15.00';
                const inpPrice = document.getElementById('vInpPrice');
                if (inpPrice) inpPrice.value = d.selling_price ? d.selling_price.toFixed(2) : '25.00';
                const inpDosage = document.getElementById('vInpDosage');
                if (inpDosage) inpDosage.value = d.dosage_form || 'Tablet';

                const badge = document.getElementById('voiceConfidenceBadge');
                if (badge) badge.textContent = `${d.confidence}% Confidence`;
            }
        } catch (err) {
            alert("Failed to analyze speech input: " + err.message);
        } finally {
            if (btnProcessVoice) {
                btnProcessVoice.disabled = false;
                btnProcessVoice.textContent = "Extract & Validate Fields →";
            }
        }
    }

    if (btnProcessVoice) {
        btnProcessVoice.addEventListener('click', processVoiceExtraction);
    }

    // Save Voice Medicine directly to database
    if (btnConfirmVoiceSave) {
        btnConfirmVoiceSave.addEventListener('click', async () => {
            const brand = document.getElementById('vInpBrand').value.trim();
            const generic = document.getElementById('vInpGeneric').value.trim();
            const batch = document.getElementById('vInpBatch').value.trim();
            const exp = document.getElementById('vInpExp').value.trim();
            const qty = parseInt(document.getElementById('vInpQty').value, 10);
            const cost = parseFloat(document.getElementById('vInpCost').value);
            const price = parseFloat(document.getElementById('vInpPrice').value);
            const dosage = document.getElementById('vInpDosage') ? document.getElementById('vInpDosage').value : 'Tablet';

            if (!brand || !batch || !exp || isNaN(qty) || qty <= 0) {
                alert("Please fill in Brand Name, Batch Number, Expiry Date, and valid Quantity.");
                return;
            }

            btnConfirmVoiceSave.disabled = true;
            btnConfirmVoiceSave.textContent = "Saving to Database...";

            try {
                const res = await fetch('/api/scanning/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        brand_name: brand,
                        generic_name: generic || brand,
                        strength: "Standard",
                        dosage_form: dosage,
                        category_id: 1,
                        batch_number: batch,
                        expiry_date: exp,
                        quantity: qty,
                        cost_price: isNaN(cost) ? 15.0 : cost,
                        selling_price: isNaN(price) ? 25.0 : price,
                        supplier_id: 1,
                        source: 'VOICE'
                    })
                });
                const json = await res.json();
                if (res.ok && json.status === 'success') {
                    showAIToast(`Saved '${brand}' (Batch ${batch}) into database! Total stock: ${json.data.total_available_stock} units.`);
                    notifyDataSaved();
                    setTimeout(() => {
                        if (modalVoice) modalVoice.classList.remove('active');
                        const resultBox = document.getElementById('voiceExtractedResult');
                        if (resultBox) resultBox.style.display = 'none';
                        if (voiceTranscriptInput) voiceTranscriptInput.value = '';
                    }, 1200);
                } else {
                    alert("Database commit failed: " + (json.detail || json.message || "Unknown error"));
                }
            } catch (err) {
                alert("Network error saving to database: " + err.message);
            } finally {
                btnConfirmVoiceSave.disabled = false;
                btnConfirmVoiceSave.textContent = "💾 Save to Database Now";
            }
        });
    }


    // =========================================================================
    // 2. REAL BARCODE & QR CODE SCANNER (Live Camera + Catalog/Payload)
    // =========================================================================
    const btnToggleQRCamera = document.getElementById('btnToggleQRCamera');
    const btnCloseQRCamera = document.getElementById('btnCloseQRCamera');
    const qrCameraWrapper = document.getElementById('qrCameraWrapper');
    const qrVideoFeed = document.getElementById('qrVideoFeed');
    const btnLookupBarcode = document.getElementById('btnLookupBarcode');
    const barcodeCodeInput = document.getElementById('barcodeCodeInput');
    const barcodeResultContainer = document.getElementById('barcodeResultContainer');

    async function startQRCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Camera access is not supported by your browser in this environment.");
            return;
        }
        try {
            qrStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            if (qrVideoFeed) {
                qrVideoFeed.srcObject = qrStream;
                qrVideoFeed.play();
            }
            if (qrCameraWrapper) qrCameraWrapper.style.display = 'block';
            if (btnToggleQRCamera) btnToggleQRCamera.textContent = "📷 Camera Active";

            if ('BarcodeDetector' in window) {
                const detector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128', 'data_matrix'] });
                const interval = setInterval(async () => {
                    if (!qrStream) { clearInterval(interval); return; }
                    try {
                        const barcodes = await detector.detect(qrVideoFeed);
                        if (barcodes && barcodes.length > 0) {
                            const detectedCode = barcodes[0].rawValue;
                            clearInterval(interval);
                            stopAllCameraStreams();
                            if (barcodeCodeInput) barcodeCodeInput.value = detectedCode;
                            performBarcodeLookup(detectedCode);
                        }
                    } catch (e) {}
                }, 400);
            }
        } catch (err) {
            alert("Could not access camera: " + err.message + ". You can enter the code manually or click a demo QR pill!");
        }
    }

    if (btnToggleQRCamera) {
        btnToggleQRCamera.addEventListener('click', () => {
            if (qrStream) {
                stopAllCameraStreams();
                btnToggleQRCamera.textContent = "📷 Start Live Camera Scan";
            } else {
                startQRCamera();
            }
        });
    }
    if (btnCloseQRCamera) {
        btnCloseQRCamera.addEventListener('click', () => {
            stopAllCameraStreams();
            if (btnToggleQRCamera) btnToggleQRCamera.textContent = "📷 Start Live Camera Scan";
        });
    }

    // Preset Demo QR buttons
    document.querySelectorAll('.btn-demo-qr').forEach(pill => {
        pill.addEventListener('click', () => {
            const code = pill.getAttribute('data-code');
            if (barcodeCodeInput) {
                barcodeCodeInput.value = code;
                performBarcodeLookup(code);
            }
        });
    });

    async function performBarcodeLookup(code) {
        if (!code || !code.trim()) {
            alert("Please enter or scan a code first.");
            return;
        }

        if (btnLookupBarcode) {
            btnLookupBarcode.disabled = true;
            btnLookupBarcode.textContent = "Scanning...";
        }

        try {
            const res = await fetch('/api/scanning/barcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code.trim() })
            });
            const data = await res.json();
            if (barcodeResultContainer) barcodeResultContainer.style.display = 'block';

            if (data.is_qr_payload && data.structured_data) {
                const s = data.structured_data;
                barcodeResultContainer.innerHTML = `
                    <div class="extracted-result-box" style="margin-top:0; border-left:4px solid var(--teal-primary);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                            <strong style="font-size:0.95rem; color:var(--text-main);">QR Pharmaceutical Payload Decoded</strong>
                            <span class="badge badge-teal">Structured QR</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.75rem;">${escapeHtml(data.message)}</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.82rem;">
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Brand:</label><input type="text" id="qrInpBrand" value="${escapeHtml(s.brand_name)}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Generic:</label><input type="text" id="qrInpGeneric" value="${escapeHtml(s.generic_name || s.brand_name)}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Batch #:</label><input type="text" id="qrInpBatch" value="${escapeHtml(s.batch_number)}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Expiry:</label><input type="date" id="qrInpExp" value="${escapeHtml(s.expiry_date)}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Qty:</label><input type="number" id="qrInpQty" value="${s.quantity}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Price (₹):</label><input type="number" id="qrInpPrice" value="${s.selling_price}" step="0.5" class="form-input" style="width:100%; padding:0.3rem;"></div>
                        </div>
                        <div style="margin-top:0.85rem; text-align:right;">
                            <button type="button" class="btn btn-sm btn-primary" id="btnSaveQRToDb" style="background:#0D9488; border-color:#0D9488;">
                                💾 Save QR Data to Database Now
                            </button>
                        </div>
                    </div>
                `;

                document.getElementById('btnSaveQRToDb').addEventListener('click', async () => {
                    const brand = document.getElementById('qrInpBrand').value.trim();
                    const generic = document.getElementById('qrInpGeneric').value.trim();
                    const batch = document.getElementById('qrInpBatch').value.trim();
                    const exp = document.getElementById('qrInpExp').value.trim();
                    const qty = parseInt(document.getElementById('qrInpQty').value, 10);
                    const price = parseFloat(document.getElementById('qrInpPrice').value);

                    try {
                        const saveRes = await fetch('/api/scanning/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                brand_name: brand,
                                generic_name: generic,
                                strength: s.strength || 'Standard',
                                dosage_form: s.dosage_form || 'Tablet',
                                category_id: s.category_id || 1,
                                batch_number: batch,
                                expiry_date: exp,
                                quantity: qty,
                                cost_price: s.cost_price || 15.0,
                                selling_price: price,
                                supplier_id: 1,
                                source: 'BARCODE_QR'
                            })
                        });
                        const saveJson = await saveRes.json();
                        if (saveRes.ok && saveJson.status === 'success') {
                            showAIToast(`QR Medicine '${brand}' stored in database! Batch: ${batch}`);
                            notifyDataSaved();
                            setTimeout(() => {
                                if (modalBarcode) modalBarcode.classList.remove('active');
                                if (barcodeResultContainer) barcodeResultContainer.style.display = 'none';
                            }, 1200);
                        } else {
                            alert("Save error: " + (saveJson.detail || saveJson.message));
                        }
                    } catch (e) {
                        alert("Failed to save QR payload: " + e.message);
                    }
                });

            } else if (data.found && data.medicine) {
                const m = data.medicine;
                const fefo = data.fefo_recommended_batch;
                barcodeResultContainer.innerHTML = `
                    <div class="extracted-result-box" style="margin-top:0;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:1rem; color:var(--text-main);">${escapeHtml(m.brand_name)} (${escapeHtml(m.strength)})</strong>
                            <span class="badge ${m.is_low_stock ? 'badge-amber' : 'badge-green'}">
                                ${m.is_low_stock ? 'Low Stock Warning' : 'In Stock'}
                            </span>
                        </div>
                        <div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.25rem;">
                            Generic: ${escapeHtml(m.generic_name)} &bull; Category: ${escapeHtml(m.category_name)}
                        </div>
                        <div style="margin-top:0.75rem; font-size:0.85rem; font-weight:700;">
                            Total Available: <span style="color:var(--teal-primary);">${m.total_available_stock} units</span>
                        </div>
                        ${fefo ? `
                        <div style="margin-top:0.75rem; padding:0.6rem; background:#F0FDFA; border:1px solid #99F6E4; border-radius:6px; font-size:0.8rem;">
                            <strong style="color:var(--teal-primary);">⚡ Recommended FEFO Allocation:</strong>
                            <div>Batch <code>${escapeHtml(fefo.batch_number)}</code> &bull; Expires: <strong>${fefo.expiry_date}</strong> (${fefo.days_left}d left) &bull; Price: ₹${fefo.selling_price.toFixed(2)}</div>
                        </div>
                        ` : ''}
                    </div>
                `;
            } else {
                barcodeResultContainer.innerHTML = `
                    <div class="extracted-result-box" style="margin-top:0; color:#991B1B; background:#FEF2F2; border-color:#FCA5A5;">
                        <strong>Code Not Found:</strong> ${escapeHtml(data.message)}
                    </div>
                `;
            }
        } catch (err) {
            alert("Lookup failed: " + err.message);
        } finally {
            if (btnLookupBarcode) {
                btnLookupBarcode.disabled = false;
                btnLookupBarcode.textContent = "Scan / Lookup";
            }
        }
    }

    if (btnLookupBarcode && barcodeCodeInput) {
        btnLookupBarcode.addEventListener('click', () => {
            performBarcodeLookup(barcodeCodeInput.value);
        });
    }


    // =========================================================================
    // 3. AI CAMERA & OPTICAL PACKAGING OCR (Snap Photo + Direct DB Commit)
    // =========================================================================
    const btnToggleOCRCamera = document.getElementById('btnToggleOCRCamera');
    const btnCloseOCRCamera = document.getElementById('btnCloseOCRCamera');
    const ocrCameraWrapper = document.getElementById('ocrCameraWrapper');
    const ocrVideoFeed = document.getElementById('ocrVideoFeed');
    const btnSnapPhoto = document.getElementById('btnSnapPhoto');
    const snapshotPreviewWrapper = document.getElementById('snapshotPreviewWrapper');
    const snapshotImgPreview = document.getElementById('snapshotImgPreview');

    const btnProcessOCR = document.getElementById('btnProcessOCR');
    const ocrRawTextInput = document.getElementById('ocrRawTextInput');
    const ocrFileInput = document.getElementById('ocrFileInput');
    const ocrResultContainer = document.getElementById('ocrResultContainer');

    let capturedBlob = null;

    async function startOCRCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Camera access is not supported by your browser in this environment.");
            return;
        }
        try {
            ocrStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            if (ocrVideoFeed) {
                ocrVideoFeed.srcObject = ocrStream;
                ocrVideoFeed.play();
            }
            if (ocrCameraWrapper) ocrCameraWrapper.style.display = 'block';
            if (btnToggleOCRCamera) btnToggleOCRCamera.textContent = "📷 Camera Viewfinder Active";
        } catch (err) {
            alert("Could not access camera: " + err.message + ". You can upload a photo or use demo presets!");
        }
    }

    if (btnToggleOCRCamera) {
        btnToggleOCRCamera.addEventListener('click', () => {
            if (ocrStream) {
                stopAllCameraStreams();
                btnToggleOCRCamera.textContent = "📸 Open Webcam / Camera";
            } else {
                startOCRCamera();
            }
        });
    }
    if (btnCloseOCRCamera) {
        btnCloseOCRCamera.addEventListener('click', () => {
            stopAllCameraStreams();
            if (btnToggleOCRCamera) btnToggleOCRCamera.textContent = "📸 Open Webcam / Camera";
        });
    }

    // Snap Photo from Live Camera Viewfinder
    if (btnSnapPhoto && ocrVideoFeed) {
        btnSnapPhoto.addEventListener('click', () => {
            const canvas = document.createElement('canvas');
            canvas.width = ocrVideoFeed.videoWidth || 640;
            canvas.height = ocrVideoFeed.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(ocrVideoFeed, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(blob => {
                capturedBlob = blob;
                const dataUrl = canvas.toDataURL('image/jpeg');
                if (snapshotImgPreview) snapshotImgPreview.src = dataUrl;
                if (snapshotPreviewWrapper) snapshotPreviewWrapper.style.display = 'block';

                stopAllCameraStreams();
                if (btnToggleOCRCamera) btnToggleOCRCamera.textContent = "📸 Retake Camera Photo";

                runOCRProcessing();
            }, 'image/jpeg', 0.9);
        });
    }

    // Demo OCR Presets
    document.querySelectorAll('.btn-demo-ocr').forEach(pill => {
        pill.addEventListener('click', () => {
            const text = pill.getAttribute('data-text');
            if (ocrRawTextInput) {
                ocrRawTextInput.value = text;
                runOCRProcessing();
            }
        });
    });

    async function runOCRProcessing() {
        if (!btnProcessOCR) return;
        btnProcessOCR.disabled = true;
        btnProcessOCR.textContent = "Running Optical OCR...";

        const formData = new FormData();
        if (capturedBlob) {
            formData.append('file', capturedBlob, 'captured_packaging.jpg');
        } else if (ocrFileInput && ocrFileInput.files.length > 0) {
            formData.append('file', ocrFileInput.files[0]);
        }
        if (ocrRawTextInput && ocrRawTextInput.value.trim()) {
            formData.append('raw_text', ocrRawTextInput.value.trim());
        }

        try {
            const res = await fetch('/api/scanning/ocr', {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            if (ocrResultContainer) ocrResultContainer.style.display = 'block';

            if (json.status === 'success') {
                const d = json.data;
                ocrResultContainer.innerHTML = `
                    <div class="extracted-result-box" style="margin-top:0; border-left:4px solid var(--teal-primary);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                            <strong style="color:var(--text-main); font-size:0.92rem;">Optical OCR Extracted Packaging Details</strong>
                            <span class="badge badge-green">${d.confidence}% Confidence</span>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.82rem;">
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Brand Name:</label><input type="text" id="ocrInpBrand" value="${escapeHtml(d.brand_name || 'Dolo 650')}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Generic / Formula:</label><input type="text" id="ocrInpGeneric" value="${escapeHtml(d.generic_name || d.brand_name || 'Paracetamol')}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Batch Lot #:</label><input type="text" id="ocrInpBatch" value="${escapeHtml(d.batch_number || 'DLO2025')}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Expiry Date:</label><input type="date" id="ocrInpExp" value="${escapeHtml(d.expiry_date || '2027-12-31')}" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Quantity:</label><input type="number" id="ocrInpQty" value="50" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Cost Price (₹):</label><input type="number" id="ocrInpCost" value="${d.cost_price ? d.cost_price.toFixed(2) : '24.50'}" step="0.5" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div><label style="font-size:0.75rem; color:var(--text-muted);">Selling Price / MRP (₹):</label><input type="number" id="ocrInpPrice" value="${d.selling_price ? d.selling_price.toFixed(2) : '34.50'}" step="0.5" class="form-input" style="width:100%; padding:0.3rem;"></div>
                            <div>
                                <label style="font-size:0.75rem; color:var(--text-muted);">Dosage Form:</label>
                                <select id="ocrInpDosage" class="form-select" style="width:100%; padding:0.3rem;">
                                    <option value="Tablet" ${d.dosage_form === 'Tablet' ? 'selected' : ''}>Tablet</option>
                                    <option value="Capsule" ${d.dosage_form === 'Capsule' ? 'selected' : ''}>Capsule</option>
                                    <option value="Syrup" ${d.dosage_form === 'Syrup' ? 'selected' : ''}>Syrup</option>
                                    <option value="Injection" ${d.dosage_form === 'Injection' ? 'selected' : ''}>Injection</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-top:0.85rem; text-align:right;">
                            <button type="button" class="btn btn-sm btn-primary" id="btnSaveOCRToDb" style="background:#0D9488; border-color:#0D9488;">
                                💾 Save Camera Packaging to Database Now
                            </button>
                        </div>
                    </div>
                `;

                document.getElementById('btnSaveOCRToDb').addEventListener('click', async () => {
                    const brand = document.getElementById('ocrInpBrand').value.trim();
                    const generic = document.getElementById('ocrInpGeneric').value.trim();
                    const batch = document.getElementById('ocrInpBatch').value.trim();
                    const exp = document.getElementById('ocrInpExp').value.trim();
                    const qty = parseInt(document.getElementById('ocrInpQty').value, 10);
                    const cost = parseFloat(document.getElementById('ocrInpCost').value);
                    const price = parseFloat(document.getElementById('ocrInpPrice').value);
                    const dosage = document.getElementById('ocrInpDosage').value;

                    try {
                        const saveRes = await fetch('/api/scanning/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                brand_name: brand,
                                generic_name: generic,
                                strength: d.strength || 'Standard',
                                dosage_form: dosage,
                                category_id: d.category_id || 1,
                                batch_number: batch,
                                expiry_date: exp,
                                quantity: qty,
                                cost_price: isNaN(cost) ? 20.0 : cost,
                                selling_price: isNaN(price) ? 30.0 : price,
                                supplier_id: 1,
                                source: 'CAMERA_OCR'
                            })
                        });
                        const saveJson = await saveRes.json();
                        if (saveRes.ok && saveJson.status === 'success') {
                            showAIToast(`Camera Packaging '${brand}' (Batch ${batch}) committed to database! Total stock: ${saveJson.data.total_available_stock} units.`);
                            notifyDataSaved();
                            setTimeout(() => {
                                if (modalOCR) modalOCR.classList.remove('active');
                                ocrResultContainer.style.display = 'none';
                                if (snapshotPreviewWrapper) snapshotPreviewWrapper.style.display = 'none';
                                capturedBlob = null;
                            }, 1200);
                        } else {
                            alert("Save error: " + (saveJson.detail || saveJson.message));
                        }
                    } catch (e) {
                        alert("Failed to save OCR data: " + e.message);
                    }
                });
            }
        } catch (err) {
            alert("OCR processing failed: " + err.message);
        } finally {
            btnProcessOCR.disabled = false;
            btnProcessOCR.textContent = "Run AI OCR Extraction →";
        }
    }

    if (btnProcessOCR) {
        btnProcessOCR.addEventListener('click', runOCRProcessing);
    }

    // =========================================================================
    // 4. AI CLINICAL SAFETY & DRUG INTERACTION ENGINE (DDI Pharmacopeia)
    // =========================================================================
    const btnOpenClinical = document.getElementById('btnOpenClinicalModal');
    const modalClinical = document.getElementById('modalClinicalChecker');
    const clinicalSelect = document.getElementById('clinicalMedSelect');
    const btnAddDrug = document.getElementById('btnAddClinicalDrug');
    const chipsContainer = document.getElementById('selectedClinicalChips');
    const chkPregnant = document.getElementById('chkClinicalPregnant');
    const btnRunAnalysis = document.getElementById('btnRunClinicalAnalysis');
    const clinicalOutput = document.getElementById('clinicalOutputContainer');

    let clinicalDrugsList = [];
    let selectedDrugs = []; // [{id, name}]

    if (btnOpenClinical && modalClinical) {
        btnOpenClinical.addEventListener('click', async () => {
            modalClinical.classList.add('active');
            if (clinicalDrugsList.length === 0) {
                await loadClinicalDrugDirectory();
            }
        });
    }

    async function loadClinicalDrugDirectory() {
        try {
            const res = await fetch('/api/clinical/common-drugs');
            if (res.ok) {
                clinicalDrugsList = await res.json();
                if (clinicalSelect) {
                    clinicalSelect.innerHTML = '<option value="">-- Choose drug to add to safety check --</option>' +
                        clinicalDrugsList.map(d => `<option value="${d.medicine_id}">${escapeHtml(d.brand_name)} (${escapeHtml(d.strength || '')}) - ${escapeHtml(d.generic_name || '')}</option>`).join('');
                }
            }
        } catch (e) {
            console.error("Clinical drugs load error", e);
        }
    }

    if (btnAddDrug && clinicalSelect) {
        btnAddDrug.addEventListener('click', () => {
            const medId = parseInt(clinicalSelect.value);
            if (!medId) return;
            const drug = clinicalDrugsList.find(d => d.medicine_id === medId);
            if (drug && !selectedDrugs.some(d => d.id === drug.medicine_id)) {
                selectedDrugs.push({ id: drug.medicine_id, name: drug.brand_name });
                renderClinicalChips();
            }
        });
    }

    function renderClinicalChips() {
        if (!chipsContainer) return;
        chipsContainer.innerHTML = selectedDrugs.map((d, idx) => `
            <span class="clinical-drug-chip">
                <span>💊 ${escapeHtml(d.name)}</span>
                <span class="remove-chip" data-idx="${idx}">&times;</span>
            </span>
        `).join('');

        chipsContainer.querySelectorAll('.remove-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                selectedDrugs.splice(idx, 1);
                renderClinicalChips();
            });
        });
    }

    // Demo Clinical Presets
    document.querySelectorAll('.btn-demo-clinical').forEach(pill => {
        pill.addEventListener('click', async () => {
            if (clinicalDrugsList.length === 0) {
                await loadClinicalDrugDirectory();
            }
            const medNames = pill.getAttribute('data-meds').split(',');
            selectedDrugs = [];
            medNames.forEach(name => {
                const match = clinicalDrugsList.find(d => d.brand_name.toLowerCase().includes(name.trim().toLowerCase()) || (d.generic_name && d.generic_name.toLowerCase().includes(name.trim().toLowerCase())));
                if (match) {
                    selectedDrugs.push({ id: match.medicine_id, name: match.brand_name });
                } else {
                    // Fallback stub for demo if not in DB
                    selectedDrugs.push({ id: selectedDrugs.length + 1, name: name.trim() });
                }
            });
            renderClinicalChips();
            executeClinicalCheck();
        });
    });

    async function executeClinicalCheck() {
        if (selectedDrugs.length === 0) {
            alert("Please select at least 1 or 2 medicines to evaluate.");
            return;
        }

        if (btnRunAnalysis) {
            btnRunAnalysis.disabled = true;
            btnRunAnalysis.textContent = "Analyzing Pharmacopeia...";
        }

        try {
            const res = await fetch('/api/clinical/check-interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    medicine_ids: selectedDrugs.map(d => d.id),
                    is_pregnant: chkPregnant ? chkPregnant.checked : false
                })
            });
            const data = await res.json();
            if (clinicalOutput) {
                clinicalOutput.style.display = 'block';
                const riskColor = data.overall_risk === 'CRITICAL_WARNING' ? '#DC2626' : (data.overall_risk === 'MODERATE_CAUTION' ? '#D97706' : '#10B981');
                const riskBadge = data.overall_risk === 'CRITICAL_WARNING' ? 'badge-expired' : (data.overall_risk === 'MODERATE_CAUTION' ? 'badge-amber' : 'badge-green');

                clinicalOutput.innerHTML = `
                    <div style="padding:1rem; border-radius:8px; margin-bottom:1rem; background:${data.overall_risk === 'CRITICAL_WARNING' ? '#FEF2F2' : (data.overall_risk === 'MODERATE_CAUTION' ? '#FFFBEB' : '#F0FDF4')}; border:1px solid ${riskColor};">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="color:${riskColor}; font-size:1.05rem;">Clinical Evaluation Status</strong>
                            <span class="badge ${riskBadge}">${data.overall_risk.replace('_', ' ')}</span>
                        </div>
                        <div style="font-size:0.88rem; font-weight:600; color:#1E293B; margin-top:0.4rem;">${escapeHtml(data.clinical_summary)}</div>
                    </div>

                    ${data.alerts && data.alerts.length > 0 ? `
                        <div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:0.5rem;">Detected Interactions (${data.alerts.length}):</div>
                        ${data.alerts.map(a => `
                            <div class="clinical-alert-card ${a.severity}">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                                    <strong style="font-size:0.9rem; color:#0F172A;">${escapeHtml(a.title)}</strong>
                                    <span class="badge ${a.severity === 'CRITICAL_WARNING' ? 'badge-expired' : 'badge-amber'}">${a.severity.replace('_', ' ')}</span>
                                </div>
                                <div style="font-size:0.82rem; color:#475569; margin-bottom:0.35rem;">
                                    <strong>Drugs:</strong> ${escapeHtml(a.drug_a)} + ${escapeHtml(a.drug_b)}
                                </div>
                                <div style="font-size:0.82rem; color:#334155; margin-bottom:0.4rem;">
                                    <strong>Pharmacological Mechanism:</strong> ${escapeHtml(a.mechanism)}
                                </div>
                                <div style="font-size:0.82rem; background:rgba(0,0,0,0.03); padding:0.4rem 0.6rem; border-radius:4px; color:#0F172A;">
                                    <strong>Pharmacist Counselling:</strong> ${escapeHtml(a.clinical_advice)}
                                </div>
                            </div>
                        `).join('')}
                    ` : `
                        <div style="padding:1.25rem; text-align:center; color:#059669; background:#ECFDF5; border-radius:6px; font-size:0.85rem;">
                            <strong>✓ Safe Drug Combination</strong>
                            <p style="margin-top:0.25rem; color:#065F46;">No adverse pharmacological interactions or contraindications found between selected formulations.</p>
                        </div>
                    `}
                `;
            }
        } catch (e) {
            alert("Clinical check failed: " + e.message);
        } finally {
            if (btnRunAnalysis) {
                btnRunAnalysis.disabled = false;
                btnRunAnalysis.textContent = "Run Pharmacological Check 🩺";
            }
        }
    }

    if (btnRunAnalysis) {
        btnRunAnalysis.addEventListener('click', executeClinicalCheck);
    }
}

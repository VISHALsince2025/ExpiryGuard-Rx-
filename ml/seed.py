# ml/seed.py
import sys
import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.db import get_connection
from app.security import hash_password
from ml.generate_data import daily_sales

def run_seed():
    conn = get_connection()
    cur = conn.cursor()
    print("Starting database seed process for ExpiryGuard Rx...")

    # 1. Seed Roles
    roles = [
        (1, 'Admin'),
        (2, 'Pharmacist'),
        (3, 'Counter'),
        (4, 'Purchase'),
        (5, 'Auditor')
    ]
    for r_id, r_name in roles:
        cur.execute("SELECT role_id FROM dbo.roles WHERE role_id = ?", r_id)
        if not cur.fetchone():
            cur.execute("INSERT INTO dbo.roles (role_id, role_name) VALUES (?, ?)", r_id, r_name)

    # 2. Seed Users
    default_users = [
        ("admin", "Dr. Vishal Admin", "admin@rxmedical.com", "Admin@123456", 1),
        ("pharmacist1", "Priya Sharma (R.Ph)", "priya@rxmedical.com", "Pharmacist@123456", 2),
        ("counter1", "Amit Kumar (Cashier)", "amit@rxmedical.com", "Counter@123456", 3),
        ("purchase1", "Rajesh Gupta (Purchase)", "rajesh@rxmedical.com", "Purchase@123456", 4),
        ("auditor1", "Sanjay Verma (Auditor)", "sanjay@rxmedical.com", "Auditor@123456", 5),
    ]

    user_ids = {}
    for uname, fname, email, pwd, rid in default_users:
        cur.execute("SELECT user_id FROM dbo.users WHERE username = ?", uname)
        row = cur.fetchone()
        if not row:
            hashed = hash_password(pwd)
            cur.execute("""
                INSERT INTO dbo.users (username, full_name, email, password_hash, role_id, is_active, failed_attempts)
                OUTPUT INSERTED.user_id
                VALUES (?, ?, ?, ?, ?, 1, 0)
            """, uname, fname, email, hashed, rid)
            uid = cur.fetchone().user_id
            user_ids[uname] = uid
        else:
            user_ids[uname] = row.user_id

    # 3. Seed Categories
    categories = [
        "Analgesics & Antipyretics",
        "Antibiotics & Antimicrobials",
        "Cardiovascular & Antihypertensives",
        "Gastrointestinal & Antacids",
        "Antidiabetic",
        "Respiratory & Antiallergic",
        "Vitamins & Supplements"
    ]
    category_ids = {}
    for cat_name in categories:
        cur.execute("SELECT category_id FROM dbo.categories WHERE category_name = ?", cat_name)
        row = cur.fetchone()
        if not row:
            cur.execute("INSERT INTO dbo.categories (category_name) OUTPUT INSERTED.category_id VALUES (?)", cat_name)
            category_ids[cat_name] = cur.fetchone().category_id
        else:
            category_ids[cat_name] = row.category_id

    # 4. Seed Suppliers (6 Wholesalers)
    suppliers_data = [
        ("Varanasi Pharma Wholesalers", "9839011223", "orders@varanasipharma.in", "Varanasi"),
        ("City Medical Distributors", "9839044556", "sales@citymeddist.com", "Varanasi"),
        ("Apollo Wholesale Lifesciences", "9820011223", "supply@apollowholesale.com", "Lucknow"),
        ("Sun Health Supply Hub", "9415088990", "info@sunhealthsupply.com", "Kanpur"),
        ("Apex Medicare Logistics", "9838022334", "support@apexmedicare.com", "Prayagraj"),
        ("CarePlus Drug Agency", "9450033445", "contact@careplusdrugs.in", "Varanasi")
    ]
    supplier_ids = []
    for s_name, phone, email, city in suppliers_data:
        cur.execute("SELECT supplier_id FROM dbo.suppliers WHERE supplier_name = ?", s_name)
        row = cur.fetchone()
        if not row:
            cur.execute("INSERT INTO dbo.suppliers (supplier_name, phone, email, city) OUTPUT INSERTED.supplier_id VALUES (?, ?, ?, ?)",
                        s_name, phone, email, city)
            supplier_ids.append(cur.fetchone().supplier_id)
        else:
            supplier_ids.append(row.supplier_id)

    # 5. Seed 40 Medicines
    medicines_catalog = [
        # Analgesics
        ("Dolo 650", "Paracetamol", "650 mg", "Tablet", "Analgesics & Antipyretics", 50, False, 15.0),
        ("Crocin Advance", "Paracetamol", "500 mg", "Tablet", "Analgesics & Antipyretics", 40, False, 12.0),
        ("Combiflam", "Ibuprofen + Paracetamol", "400/325 mg", "Tablet", "Analgesics & Antipyretics", 30, False, 10.0),
        ("Zerodol-P", "Aceclofenac + Paracetamol", "100/325 mg", "Tablet", "Analgesics & Antipyretics", 25, False, 8.0),
        ("Meftal-Spas", "Mefenamic Acid + Dicyclomine", "250/10 mg", "Tablet", "Analgesics & Antipyretics", 20, False, 5.0),
        ("Voveran SR", "Diclofenac Sodium", "100 mg", "Tablet", "Analgesics & Antipyretics", 20, False, 4.0),

        # Antibiotics
        ("Augmentin 625 Duo", "Amoxicillin + Clavulanic Acid", "500/125 mg", "Tablet", "Antibiotics & Antimicrobials", 30, True, 9.0),
        ("Azithral 500", "Azithromycin", "500 mg", "Tablet", "Antibiotics & Antimicrobials", 25, True, 7.0),
        ("Cifran 500", "Ciprofloxacin", "500 mg", "Tablet", "Antibiotics & Antimicrobials", 20, True, 5.0),
        ("Taxim-O 200", "Cefixime", "200 mg", "Tablet", "Antibiotics & Antimicrobials", 25, True, 6.0),
        ("Clavam 625", "Amoxicillin + Potassium Clavulanate", "625 mg", "Tablet", "Antibiotics & Antimicrobials", 30, True, 8.0),
        ("Oflox 200", "Ofloxacin", "200 mg", "Tablet", "Antibiotics & Antimicrobials", 20, True, 4.0),

        # Gastrointestinal
        ("Pan 40", "Pantoprazole", "40 mg", "Tablet", "Gastrointestinal & Antacids", 40, False, 12.0),
        ("Pantocid DSR", "Pantoprazole + Domperidone", "40/30 mg", "Capsule", "Gastrointestinal & Antacids", 35, False, 10.0),
        ("Razo 20", "Rabeprazole Sodium", "20 mg", "Tablet", "Gastrointestinal & Antacids", 25, False, 6.0),
        ("Omez 20", "Omeprazole", "20 mg", "Capsule", "Gastrointestinal & Antacids", 30, False, 8.0),
        ("Digene Gel", "Aluminium Hydroxide + Magnesium", "200 ml", "Syrup", "Gastrointestinal & Antacids", 15, False, 4.0),
        ("Gelusil MPS", "Dimethicone + Aluminium Oxide", "170 ml", "Syrup", "Gastrointestinal & Antacids", 15, False, 3.5),

        # Cardiovascular
        ("Telma 40", "Telmisartan", "40 mg", "Tablet", "Cardiovascular & Antihypertensives", 30, True, 7.5),
        ("Telma H", "Telmisartan + Hydrochlorothiazide", "40/12.5 mg", "Tablet", "Cardiovascular & Antihypertensives", 20, True, 4.0),
        ("Amlong 5", "Amlodipine", "5 mg", "Tablet", "Cardiovascular & Antihypertensives", 35, True, 8.0),
        ("Atorva 10", "Atorvastatin", "10 mg", "Tablet", "Cardiovascular & Antihypertensives", 25, True, 6.0),
        ("Ecosprin 75", "Aspirin", "75 mg", "Tablet", "Cardiovascular & Antihypertensives", 50, False, 14.0),
        ("Rosuvas 10", "Rosuvastatin", "10 mg", "Tablet", "Cardiovascular & Antihypertensives", 20, True, 4.5),

        # Antidiabetic
        ("Glycomet 500 SR", "Metformin Hydrochloride", "500 mg", "Tablet", "Antidiabetic", 40, True, 11.0),
        ("Glycomet GP 1", "Glimepiride + Metformin", "1/500 mg", "Tablet", "Antidiabetic", 30, True, 7.0),
        ("Januvia 100", "Sitagliptin", "100 mg", "Tablet", "Antidiabetic", 15, True, 3.0),
        ("Galvus 50", "Vildagliptin", "50 mg", "Tablet", "Antidiabetic", 20, True, 4.0),
        ("Jardiance 10", "Empagliflozin", "10 mg", "Tablet", "Antidiabetic", 15, True, 3.5),

        # Respiratory
        ("Allegra 120", "Fexofenadine Hydrochloride", "120 mg", "Tablet", "Respiratory & Antiallergic", 25, False, 6.5),
        ("Montair LC", "Montelukast + Levocetirizine", "10/5 mg", "Tablet", "Respiratory & Antiallergic", 30, True, 8.0),
        ("Ascoril D Plus", "Dextromethorphan + Chlorpheniramine", "100 ml", "Syrup", "Respiratory & Antiallergic", 20, False, 5.0),
        ("Cetzine", "Cetirizine Hydrochloride", "10 mg", "Tablet", "Respiratory & Antiallergic", 40, False, 9.0),
        ("Alex Syrup", "Phenylephrine + Chlorpheniramine", "100 ml", "Syrup", "Respiratory & Antiallergic", 15, False, 4.0),

        # Vitamins & Supplements
        ("Becosules Z", "Vitamin B-Complex + Zinc", "1 Capsule", "Capsule", "Vitamins & Supplements", 45, False, 12.0),
        ("Shelcal 500", "Calcium + Vitamin D3", "500 mg", "Tablet", "Vitamins & Supplements", 35, False, 10.0),
        ("Limcee 500", "Vitamin C (Ascorbic Acid)", "500 mg", "Tablet", "Vitamins & Supplements", 40, False, 11.0),
        ("Supradyn Daily", "Multivitamin & Multi-minerals", "1 Tablet", "Tablet", "Vitamins & Supplements", 30, False, 7.0),
        ("Evion 400", "Vitamin E", "400 mg", "Capsule", "Vitamins & Supplements", 35, False, 8.5),
        ("Neurobion Forte", "Vitamin B-Complex with B12", "1 Tablet", "Tablet", "Vitamins & Supplements", 40, False, 9.5)
    ]

    med_records = [] # (med_id, base_demand)
    for brand, generic, strn, form, cat_name, reorder, rx_flag, base_demand in medicines_catalog:
        c_id = category_ids[cat_name]
        cur.execute("""
            SELECT medicine_id FROM dbo.medicines
            WHERE brand_name = ? AND strength = ? AND dosage_form = ?
        """, brand, strn, form)
        row = cur.fetchone()
        if not row:
            cur.execute("""
                INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level, requires_prescription, is_active)
                OUTPUT INSERTED.medicine_id
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """, brand, generic, strn, form, c_id, reorder, 1 if rx_flag else 0)
            m_id = cur.fetchone().medicine_id
        else:
            m_id = row.medicine_id
        med_records.append((m_id, base_demand))

    # Check if batches already populated
    cur.execute("SELECT COUNT(*) AS b_count FROM dbo.batches")
    if cur.fetchone().b_count > 30:
        print("Batches already seeded. Skipping batch generation.")
        conn.commit()
        conn.close()
        return

    # 6. Create Delivery (GRN) headers
    today = date.today()
    grn_ids = []
    for i, s_id in enumerate(supplier_ids):
        inv_no = f"INV-2026-00{i+1}A"
        inv_date = today - timedelta(days=90 - i * 12)
        cur.execute("""
            INSERT INTO dbo.grn (supplier_id, invoice_number, invoice_date, received_by)
            OUTPUT INSERTED.grn_id
            VALUES (?, ?, ?, ?)
        """, s_id, inv_no, inv_date, user_ids["pharmacist1"])
        grn_ids.append(cur.fetchone().grn_id)

    # 7. Create Batches across 4 Expiry Bands:
    # - Past Expired (EXPIRED band)
    # - Critical Near-Expiry (RED <= 30d)
    # - Approaching Expiry (AMBER <= 90d)
    # - Healthy Expiry (GREEN > 90d)
    # And compute initial simulated sales without violating reconciliation Q12
    print("Generating batches and historical sales across 90 days...")
    
    batch_counter = 1
    cashier_id = user_ids["counter1"]

    for m_id, base_demand in med_records:
        # Generate 3 distinct batches for this medicine
        # Lot 1: Expired or Red band
        # Lot 2: Amber band
        # Lot 3: Green band
        batch_configs = [
            # (batch_num, expiry_offset_days, qty_received, cost, sell, is_expired)
            (f"LOT{batch_counter:03d}A", -15 if (m_id % 3 == 0) else 18, 150, 18.00, 25.00, m_id % 3 == 0),
            (f"LOT{batch_counter:03d}B", 60, 200, 17.50, 25.00, False),
            (f"LOT{batch_counter:03d}C", 240, 350, 16.00, 25.00, False)
        ]
        batch_counter += 1

        # Simulate past daily sales over 90 days for this medicine
        sales_curve = daily_sales(base_demand, days=90, winter_bump=(m_id % 2 == 0))
        total_units_demanded = sum(val for _, val in sales_curve)

        batches_info = []
        for b_no, exp_offset, qty_recv, cost, sell, expired in batch_configs:
            exp_date = today + timedelta(days=exp_offset)
            batches_info.append({
                "batch_number": b_no,
                "expiry_date": exp_date,
                "qty_received": qty_recv,
                "cost_price": cost,
                "selling_price": sell,
                "status": "EXPIRED" if expired else "ACTIVE",
                "grn_id": grn_ids[m_id % len(grn_ids)],
                "qty_on_hand": qty_recv,
                "sold_units": 0
            })

        # Distribute demanded units using FEFO across active batches
        units_left_to_distribute = total_units_demanded
        for b in sorted(batches_info, key=lambda x: x["expiry_date"]):
            # Past sales could only take up to 80% of received units so inventory remains
            max_can_sell = int(b["qty_received"] * 0.75)
            take = min(max_can_sell, units_left_to_distribute)
            b["sold_units"] = take
            b["qty_on_hand"] = b["qty_received"] - take
            units_left_to_distribute -= take

        # Insert Batches into Database
        for b in batches_info:
            cur.execute("""
                INSERT INTO dbo.batches (medicine_id, grn_id, batch_number, expiry_date,
                                         qty_received, qty_on_hand, cost_price, selling_price, status)
                OUTPUT INSERTED.batch_id
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, m_id, b["grn_id"], b["batch_number"], b["expiry_date"],
                 b["qty_received"], b["qty_on_hand"], b["cost_price"], b["selling_price"], b["status"])
            b["batch_id"] = cur.fetchone().batch_id

        # Insert historical sales and sale_items matching exact sold_units
        for b in batches_info:
            sold_total = b["sold_units"]
            if sold_total <= 0:
                continue

            # Break sold units into ~5 distinct historical bills across the 90 days
            splits = 5
            portion = sold_total // splits
            remainder = sold_total % splits

            for p_idx in range(splits):
                bill_qty = portion + (remainder if p_idx == 0 else 0)
                if bill_qty <= 0:
                    continue
                sale_dt = datetime.now(timezone.utc) - timedelta(days=int(90 * (1 - p_idx / splits)))
                sale_time_str = sale_dt.strftime("%Y-%m-%d %H:%M:%S")

                cur.execute("""
                    INSERT INTO dbo.sales (sold_by, sale_time, customer_name, payment_mode)
                    OUTPUT INSERTED.sale_id
                    VALUES (?, ?, ?, ?)
                """, cashier_id, sale_time_str, f"Walk-in Customer {m_id}-{p_idx}", "UPI" if p_idx % 2 == 0 else "CASH")
                s_id = cur.fetchone().sale_id

                cur.execute("""
                    INSERT INTO dbo.sale_items (sale_id, batch_id, quantity, unit_price)
                    VALUES (?, ?, ?, ?)
                """, s_id, b["batch_id"], bill_qty, b["selling_price"])

    # 8. Create a sample Approved Return & Pending Return for realism
    # Pick a batch from LOT001A
    cur.execute("SELECT batch_id, qty_on_hand FROM dbo.batches WHERE status = 'EXPIRED' LIMIT 1")
    exp_batch = cur.fetchone()
    if exp_batch and exp_batch.qty_on_hand >= 10:
        ret_qty = 10
        cur.execute("""
            INSERT INTO dbo.supplier_returns (batch_id, return_qty, reason, status, credit_note_no, credit_amount, created_by, approved_by)
            VALUES (?, ?, 'EXPIRED', 'APPROVED', 'CRN-2026-901', 180.00, ?, ?)
        """, exp_batch.batch_id, ret_qty, user_ids["purchase1"], user_ids["pharmacist1"])
        # Deduct from batch to preserve reconciliation
        cur.execute("UPDATE dbo.batches SET qty_on_hand = qty_on_hand - ? WHERE batch_id = ?", ret_qty, exp_batch.batch_id)

    conn.commit()
    print("Database seeding completed.")

    # 9. Verify Query Q12 Reconciliation
    print("Running Reconciliation Query Q12 (qty_on_hand == qty_received - sold - returned)...")
    cur.execute("""
        SELECT b.batch_id, b.qty_received, 
               COALESCE(s.sold, 0) AS sold, 
               COALESCE(r.ret, 0) AS returned, 
               b.qty_on_hand
        FROM dbo.batches b
        LEFT JOIN (
            SELECT batch_id, SUM(quantity) AS sold 
            FROM dbo.sale_items 
            GROUP BY batch_id
        ) s ON s.batch_id = b.batch_id
        LEFT JOIN (
            SELECT batch_id, SUM(return_qty) AS ret 
            FROM dbo.supplier_returns
            WHERE status IN ('APPROVED', 'CREDITED') 
            GROUP BY batch_id
        ) r ON r.batch_id = b.batch_id
        WHERE b.qty_received - COALESCE(s.sold, 0) - COALESCE(r.ret, 0) <> b.qty_on_hand;
    """)
    mismatches = cur.fetchall()
    if len(mismatches) == 0:
        print("[SUCCESS] Query Q12 returned EXACTLY ZERO ROWS! Inventory mathematical integrity is 100% verified.")
    else:
        print(f"[WARNING] Query Q12 found {len(mismatches)} discrepancies!")
        for m in mismatches[:5]:
            print(f"Batch {m.batch_id}: recv={m.qty_received}, sold={m.sold}, ret={m.returned}, on_hand={m.qty_on_hand}")

    conn.close()

if __name__ == "__main__":
    run_seed()

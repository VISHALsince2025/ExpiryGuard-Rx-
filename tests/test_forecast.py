# tests/test_forecast.py
from datetime import date, timedelta
from app.services.forecast import batch_risk, smooth, naive, mae

def test_batch_risk_worked_example_from_pdf():
    """
    Test the exact worked check specified on page 40 of the Build Guide:
    Forecast: 5 units/day.
    Batch B1: 300 units, 40 days left.
    Batch B2: 500 units, 120 days left.
    B1 can sell 5 x 40 = 200 -> 100 units at risk.
    B2 can sell 5 x 120 - 200 = 400 -> 100 units at risk.
    Expected: Both batches have exactly 100 units at risk.
    """
    today = date(2026, 10, 11)
    b1_exp = today + timedelta(days=40)
    b2_exp = today + timedelta(days=120)

    batches = [
        {"batch_id": 101, "qty": 300, "expiry_date": b1_exp, "cost": 10.0},
        {"batch_id": 102, "qty": 500, "expiry_date": b2_exp, "cost": 10.0}
    ]

    daily_forecast = 5.0
    results = batch_risk(batches, daily_forecast, today)

    assert len(results) == 2
    r_map = {r["batch_id"]: r for r in results}

    assert r_map[101]["units_at_risk"] == 100
    assert r_map[101]["value_at_risk"] == 1000.0

    assert r_map[102]["units_at_risk"] == 100
    assert r_map[102]["value_at_risk"] == 1000.0

def test_smooth_and_naive():
    series = [10.0, 12.0, 11.0, 13.0, 15.0, 14.0, 16.0]
    s_val = smooth(series, alpha=0.3)
    n_val = naive(series, window=3)

    assert isinstance(s_val, float)
    assert n_val == 15.0 # average of [15.0, 14.0, 16.0]

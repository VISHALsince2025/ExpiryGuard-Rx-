# app/services/forecast.py
from datetime import date

def smooth(daily_units, alpha=0.3):
    """
    Exponential smoothing: recent days count more. Returns predicted units per day.
    """
    if not daily_units:
        return 0.0
    f = float(daily_units[0])
    for y in daily_units[1:]:
        f = alpha * float(y) + (1 - alpha) * f
    return round(f, 2)

def naive(daily_units, window=7):
    """
    Baseline naive forecasting: 7-day rolling window mean.
    """
    if not daily_units:
        return 0.0
    last = daily_units[-window:]
    return round(sum(last) / len(last), 2)

def mae(actual, predicted_per_day):
    """
    Mean Absolute Error between actual values and predicted scalar per day.
    """
    if not actual:
        return 0.0
    return round(sum(abs(a - predicted_per_day) for a in actual) / len(actual), 2)

def pick_alpha(train, valid):
    """
    Finds optimal smoothing alpha from candidate grid [0.1, 0.2, 0.3, 0.4, 0.5] minimizing validation MAE.
    """
    best, best_err = 0.3, float("inf")
    for a in (0.1, 0.2, 0.3, 0.4, 0.5):
        pred = smooth(train, a)
        err = mae(valid, pred)
        if err < best_err:
            best, best_err = a, err
    return best

def batch_risk(batches, daily_forecast, today):
    """
    batches: list of dicts with batch_id, qty, expiry_date (datetime.date), cost.
    FEFO sells the earliest-expiring batch first, so market demand is consumed in expiry order.
    """
    result, sold_so_far = [], 0.0
    for b in sorted(batches, key=lambda x: x["expiry_date"]):
        days_left = max(0, (b["expiry_date"] - today).days)
        can_sell = max(0.0, daily_forecast * days_left - sold_so_far)
        sold = min(float(b["qty"]), can_sell)
        sold_so_far += sold
        at_risk = max(0, round(b["qty"] - sold))
        result.append({
            "batch_id": b["batch_id"],
            "units_at_risk": at_risk,
            "value_at_risk": round(at_risk * float(b["cost"]), 2)
        })
    return result

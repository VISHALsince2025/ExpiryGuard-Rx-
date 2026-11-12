# ml/generate_data.py
import numpy as np
from datetime import date, timedelta

rng = np.random.default_rng(42) # Fixed seed ensures reproducibility

def daily_sales(base, days=90, winter_bump=False):
    """
    Generates synthetic daily demand incorporating weekend spikes, Poisson dispersion,
    and optional seasonal respiratory disease increases.
    """
    start = date.today() - timedelta(days=days)
    out = []
    for i in range(days):
        day = start + timedelta(days=i)
        weekday_factor = 1.25 if day.weekday() in (5, 6) else 1.0
        season = 1.0
        if winter_bump and day.month in (10, 11, 12):
            season = 1.0 + 0.005 * i
        
        # Poisson demand centered on base rate
        val = int(rng.poisson(max(0.1, base * weekday_factor * season)))
        out.append((day, val))
    return out

if __name__ == "__main__":
    series = daily_sales(12.0, days=90, winter_bump=True)
    print(f"Generated {len(series)} days of sales. Sample first 3:", series[:3])

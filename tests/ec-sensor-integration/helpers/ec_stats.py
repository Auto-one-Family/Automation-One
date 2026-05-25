from __future__ import annotations

from dataclasses import dataclass, asdict
from statistics import mean, median, pstdev
from typing import Sequence


@dataclass(slots=True)
class SeriesStats:
    count: int
    min_value: float
    max_value: float
    span: float
    avg: float
    median: float
    stddev: float
    cv_percent: float
    outlier_gt_3sigma: int

    def to_dict(self) -> dict[str, float | int]:
        return asdict(self)


def calc_stats(values: Sequence[float]) -> SeriesStats:
    if not values:
        raise ValueError("values must not be empty")
    avg = mean(values)
    med = median(values)
    std = pstdev(values) if len(values) > 1 else 0.0
    min_v = min(values)
    max_v = max(values)
    span = max_v - min_v
    cv = (std / avg * 100.0) if avg != 0 else 0.0
    threshold = 3.0 * std
    outliers = sum(1 for value in values if std > 0 and abs(value - avg) > threshold)
    return SeriesStats(
        count=len(values),
        min_value=min_v,
        max_value=max_v,
        span=span,
        avg=avg,
        median=med,
        stddev=std,
        cv_percent=cv,
        outlier_gt_3sigma=outliers,
    )

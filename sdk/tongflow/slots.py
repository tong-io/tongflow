"""SDK decorator used for plugin registration (required)."""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar, cast

F = TypeVar("F", bound=Callable[..., object])


def node_slot(*slots: str) -> Callable[[F], F]:
    """Declare which ABI `nodeSlot`(s) this method implements."""

    def deco(fn: F) -> F:
        existing: tuple[str, ...] = getattr(fn, "__tongflow_slots__", ())
        merged = existing + tuple(slots)
        setattr(fn, "__tongflow_slots__", tuple(dict.fromkeys(merged)))
        return cast(F, fn)

    return deco

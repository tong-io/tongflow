"""SDK decorator used for plugin registration (required).

`@node_slot(...)` does two things now:

1. **Metadata**: stamps `__tongflow_slots__` on the wrapped function so the
   plugin scanner picks up the slot binding.
2. **Type marshalling**: at call time, if the function's first non-self
   parameter is annotated as a Pydantic `BaseModel` subclass, the raw `dict`
   coming from Modal is rebuilt into a `BaseModel` instance via
   `model_construct` (recursively for nested `$ref` fields). Plugin code can
   then dot-access — `input.image.bytesBase64`, `input.duration` — and the
   static checker (pyright / mypy) is the single, authoritative contract gate.

   `model_construct` is deliberately used instead of `model_validate`: we do
   NOT want any runtime ABI checking. The TS layer + generated Pydantic types
   are the contract; bad data flowing in just lets Python raise naturally.

3. **Return marshalling**: if the function returns a `BaseModel`, we
   `model_dump(mode="json")` it back to a plain dict before Modal serializes.
"""

from __future__ import annotations

import functools
import inspect
import types
import typing
from collections.abc import Callable
from typing import Any, TypeVar, cast

from pydantic import BaseModel

F = TypeVar("F", bound=Callable[..., object])


def _basemodel_from_annotation(ann: object) -> type[BaseModel] | None:
    """If `ann` is `BaseModel`/`BaseModel | None`/`Optional[BaseModel]`, return the class.

    Handles `T | None` (PEP 604), `typing.Optional[T]`, `typing.Union[T, None]`.
    Anything else (lists, dicts, primitives, raw types, generics) → None.
    """
    if isinstance(ann, type) and issubclass(ann, BaseModel):
        return ann
    origin = typing.get_origin(ann)
    if origin in (typing.Union, types.UnionType):
        for arg in typing.get_args(ann):
            if arg is type(None):
                continue
            inner = _basemodel_from_annotation(arg)
            if inner is not None:
                return inner
    return None


def _list_item_basemodel(ann: object) -> type[BaseModel] | None:
    """If `ann` is `list[BaseModel]` (or wrapped in Optional), return the item class."""
    origin = typing.get_origin(ann)
    if origin in (typing.Union, types.UnionType):
        for arg in typing.get_args(ann):
            if arg is type(None):
                continue
            inner = _list_item_basemodel(arg)
            if inner is not None:
                return inner
        return None
    if origin is list:
        (item_ann,) = typing.get_args(ann) or (None,)
        return _basemodel_from_annotation(item_ann)
    return None


def _deep_construct(cls: type[BaseModel], data: dict[str, Any]) -> BaseModel:
    """Recursively `model_construct` from a (possibly nested) dict.

    No validation: bad shapes / wrong types pass through unchanged. The goal is
    structural — sub-dicts that should be Pydantic models get turned into
    instances so plugin code can dot-access them uniformly.
    """
    kwargs: dict[str, Any] = {}
    for name, field in cls.model_fields.items():
        if name not in data:
            continue
        val = data[name]
        ann = field.annotation

        nested_cls = _basemodel_from_annotation(ann)
        if nested_cls is not None and isinstance(val, dict):
            kwargs[name] = _deep_construct(nested_cls, val)
            continue

        list_item_cls = _list_item_basemodel(ann)
        if list_item_cls is not None and isinstance(val, list):
            kwargs[name] = [
                _deep_construct(list_item_cls, item)
                if isinstance(item, dict)
                else item
                for item in val
            ]
            continue

        kwargs[name] = val
    return cls.model_construct(**kwargs)


def _input_model_cls(fn: Callable[..., object]) -> type[BaseModel] | None:
    """Extract the Pydantic input model class from `fn`'s first non-self param."""
    try:
        hints = typing.get_type_hints(fn)
        sig = inspect.signature(fn)
    except (NameError, TypeError):
        return None
    for name in sig.parameters:
        if name in ("self", "cls"):
            continue
        ann = hints.get(name)
        return _basemodel_from_annotation(ann)
    return None


def _is_method(fn: Callable[..., object]) -> bool:
    """True when `fn`'s first positional parameter is `self`/`cls`.

    Modal plugins decorate class methods (`def slot(self, input)`); API plugins
    decorate module-level functions (`def slot(input)`). The wrapper signature
    has to match so callers can invoke either form with a single `input` arg.
    """
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return False
    for p in sig.parameters.values():
        return p.name in ("self", "cls")
    return False


def node_slot(*slots: str) -> Callable[[F], F]:
    """Declare which ABI `nodeSlot`(s) this method implements.

    The decorated function is also wrapped so that:
    - its input `dict` is converted to a Pydantic instance (recursively), and
    - a Pydantic return value is dumped back to dict for Modal.

    Works for both class methods (Modal plugins) and module functions (API
    plugins) — the wrapper introspects the underlying signature at decoration
    time.
    """

    def deco(fn: F) -> F:
        input_cls = _input_model_cls(fn)
        is_method = _is_method(fn)

        def _marshal(input: Any) -> Any:
            if input_cls is not None and isinstance(input, dict):
                return _deep_construct(input_cls, input)
            return input

        def _finalize(result: Any) -> Any:
            if isinstance(result, BaseModel):
                return result.model_dump(mode="json")
            return result

        wrapper: Callable[..., Any]
        if is_method:

            @functools.wraps(fn)
            def method_wrapper(
                self: Any, input: Any, /, *args: Any, **kwargs: Any
            ) -> Any:
                return _finalize(
                    fn(self, _marshal(input), *args, **kwargs)
                )

            wrapper = method_wrapper
        else:

            @functools.wraps(fn)
            def fn_wrapper(input: Any, /, *args: Any, **kwargs: Any) -> Any:
                return _finalize(fn(_marshal(input), *args, **kwargs))

            wrapper = fn_wrapper

        existing: tuple[str, ...] = getattr(fn, "__tongflow_slots__", ())
        merged = existing + tuple(slots)
        setattr(wrapper, "__tongflow_slots__", tuple(dict.fromkeys(merged)))
        return cast(F, wrapper)

    return deco

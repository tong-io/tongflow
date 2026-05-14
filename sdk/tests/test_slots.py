"""Test `@node_slot` decorator behaviour around dict↔BaseModel marshalling."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from tongflow.slots import node_slot


class Asset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bytesBase64: str
    mime: str | None = None


class FooIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    image: Asset | None = None
    extras: list[Asset] | None = None


class FooOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    result: str


def test_dict_in_becomes_model_attribute_access_works() -> None:
    @node_slot("foo")
    def handler(self: object, input: FooIn) -> FooOut:
        assert isinstance(input, FooIn)
        assert input.text == "hi"
        return FooOut(success=True, result=input.text.upper())

    out = handler(None, {"text": "hi"})
    assert out == {"success": True, "result": "HI"}


def test_nested_dict_becomes_nested_model() -> None:
    @node_slot("foo")
    def handler(self: object, input: FooIn) -> FooOut:
        # Nested $ref field must be a real Asset instance, not a raw dict.
        assert isinstance(input.image, Asset)
        assert input.image.bytesBase64 == "abc"
        return FooOut(success=True, result=input.image.bytesBase64)

    out = handler(None, {"text": "hi", "image": {"bytesBase64": "abc"}})
    assert out == {"success": True, "result": "abc"}


def test_list_of_basemodel_field() -> None:
    @node_slot("foo")
    def handler(self: object, input: FooIn) -> FooOut:
        assert input.extras is not None
        assert all(isinstance(a, Asset) for a in input.extras)
        assert [a.bytesBase64 for a in input.extras] == ["x", "y"]
        return FooOut(success=True, result="ok")

    out = handler(
        None,
        {
            "text": "hi",
            "extras": [{"bytesBase64": "x"}, {"bytesBase64": "y"}],
        },
    )
    assert out == {"success": True, "result": "ok"}


def test_no_basemodel_input_passthrough() -> None:
    """Plain functions without a BaseModel-typed input are untouched."""

    @node_slot("legacy")
    def handler(self: object, input: dict) -> dict:
        return {"echo": input.get("x")}

    out = handler(None, {"x": 1})
    assert out == {"echo": 1}


def test_slots_metadata_attached() -> None:
    @node_slot("a", "b")
    def handler(self: object, input: FooIn) -> None:
        return None

    assert handler.__tongflow_slots__ == ("a", "b")


def test_construct_skips_validation() -> None:
    """`model_construct` (not `model_validate`) → wrong type silently accepted.

    This documents the design: no runtime ABI enforcement at the decorator.
    """

    @node_slot("foo")
    def handler(self: object, input: FooIn) -> FooOut:
        # `text` declared as `str` but a number flowed in. Plugin sees it as-is.
        assert input.text == 42  # type: ignore[comparison-overlap]
        return FooOut(success=True, result=str(input.text))

    out = handler(None, {"text": 42})
    assert out == {"success": True, "result": "42"}

"""Design flags declare supported UI layout variants.

The app teaches interaction patterns layer by layer, so the same backend often
needs to render small layout experiments without forking templates or adding
layer-specific frontend code. This module is the registry of allowed design
flag names and values. The first option is the default; active values live on
the ``Application`` instance and are validated against this registry.
"""

DESIGN_FLAGS = {
    "CHIPS_POSITION": ["under_search", "above_results"],
    "FILTER_UI": ["sidebar", "popover"],
}


def default_design_flags() -> dict[str, str]:
    """Return each design flag set to its first declared option."""
    return {name: options[0] for name, options in DESIGN_FLAGS.items()}


def validate_design_flag(name: str, value: str) -> None:
    """Raise ``ValueError`` if a flag name or value is not supported."""
    if name not in DESIGN_FLAGS:
        raise ValueError(f"Unknown design flag: {name}")

    options = DESIGN_FLAGS[name]
    if value not in options:
        allowed = ", ".join(options)
        raise ValueError(
            f"Invalid value for {name}: {value}. Expected one of: {allowed}"
        )

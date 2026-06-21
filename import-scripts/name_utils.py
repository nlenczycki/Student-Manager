"""
name_utils.py

Shared name-normalization logic for matching students/instructors across
CTA and FlightCircle exports.

Why this exists:
- FlightCircle exports often include a parenthetical nickname or rating
  after a name, e.g. "Robert (Nick) Holt" or "Andrew Evans (CFII)".
- CTA exports use plain "First Last" names with no parentheticals.
- To join records between the two systems on name, we strip parentheticals
  and normalize whitespace/case before comparing.

This is a stopgap. Name-matching is inherently fragile (two "John Smith"s
would collide). The moment either system can export a stable student ID,
switch to matching on ID instead and treat this module as a fallback only.
"""

import re

_PAREN_PATTERN = re.compile(r"\s*\([^)]*\)")


def strip_parenthetical(name: str) -> str:
    """Remove any '(...)' segment from a name, e.g. ratings or nicknames.

    'Robert (Nick) Holt'      -> 'Robert Holt'
    'Andrew Evans (CFII)'     -> 'Andrew Evans'
    'Cameron Parchment (MEI/CHECK/Safety)' -> 'Cameron Parchment'
    """
    if not isinstance(name, str):
        return name
    return _PAREN_PATTERN.sub("", name).strip()


def normalize_name(name: str) -> str:
    """Produce a stable join key for a person's name.

    Strips parentheticals, collapses internal whitespace, and lowercases.
    Use this as the matching key — never as a display name.
    """
    if not isinstance(name, str):
        return ""
    cleaned = strip_parenthetical(name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.lower()


def display_name(name: str) -> str:
    """Clean a name for display purposes (keeps original casing, strips parens)."""
    if not isinstance(name, str):
        return name
    cleaned = strip_parenthetical(name)
    return re.sub(r"\s+", " ", cleaned).strip()

#!/usr/bin/env python3
"""Parse every SQL migration with PostgreSQL's own grammar.

A migration is the one artefact in this repo that cannot be checked by running
the test suite: `node --test` never sees it, and the first time anybody finds a
syntax error is when it is pasted into the Supabase SQL editor against the live
gym database. Worse, `pglast.parse_sql` alone is not enough — to the SQL grammar
a function body is just a string literal, so a broken plpgsql body parses
cleanly and fails only at CREATE FUNCTION time.

This parses the statements AND every function body, plpgsql included.

    python3 scripts/check-sql-syntax.py [path ...]

Needs `pglast` (pip install pglast). Without it the script says so and exits 0,
so it never becomes a blocker on a machine that cannot install it.
"""
import json
import re
import sys
from pathlib import Path

try:
    from pglast import parse_plpgsql, parse_sql, split
    from pglast.parser import ParseError
except ImportError:
    print("pglast is not installed — skipping SQL syntax check (pip install pglast).")
    sys.exit(0)

ROOT = Path(__file__).resolve().parent.parent
CREATE_FUNCTION = re.compile(r"(?is)^\s*create\s+(or\s+replace\s+)?function")
LANGUAGE = re.compile(r"(?is)\blanguage\s+(\w+)")
BODY = re.compile(r"(?s)\bas\s+\$\$(.*)\$\$")


def check(path: Path) -> list[str]:
    sql = path.read_text()
    problems: list[str] = []
    try:
        statements = split(sql)
    except ParseError as error:
        return [f"{path}: {error}"]

    for statement in statements:
        head = re.sub(r"\s+", " ", statement.strip())[:70]
        try:
            parse_sql(statement)
        except ParseError as error:
            problems.append(f"{path}: {head} -> {error}")
            continue
        if not CREATE_FUNCTION.match(statement):
            continue
        language = LANGUAGE.search(statement)
        language = language.group(1).lower() if language else ""
        if language == "plpgsql":
            try:
                parse_plpgsql(statement)
            except ParseError as error:
                problems.append(f"{path}: {head} -> {error}")
            except json.JSONDecodeError:
                # pglast cannot deserialise its own output for trigger
                # functions. The parse itself succeeded — a real syntax error
                # raises ParseError above, well before this point.
                pass
        elif language == "sql":
            body = BODY.search(statement)
            if body:
                try:
                    parse_sql(body.group(1))
                except ParseError as error:
                    problems.append(f"{path}: {head} (function body) -> {error}")
    return problems


def main() -> int:
    if len(sys.argv) > 1:
        paths = [Path(argument) for argument in sys.argv[1:]]
    else:
        paths = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
        paths += sorted((ROOT / "src" / "supabase").glob("*.sql"))

    problems: list[str] = []
    for path in paths:
        problems.extend(check(path))

    print(f"Parsed {len(paths)} SQL file{'' if len(paths) == 1 else 's'}.")
    for problem in problems:
        print("  " + problem)
    if problems:
        print(f"{len(problems)} SQL syntax problem{'' if len(problems) == 1 else 's'}.")
        return 1
    print("No SQL syntax problems.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

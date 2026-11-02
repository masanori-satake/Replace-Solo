#!/usr/bin/env python3
"""バージョン一括更新のテンプレート (Update Version Template).

プロジェクト内の複数ファイルに散らばるバージョン表記を、指定したバージョンに一括で書き換える。
このスクリプトは **テンプレート** であり、各プロジェクトの実ファイル構成に合わせて
`JSON_TARGETS` / `TEXT_TARGETS` を編集して使う。

使い方 (Usage):
  npm run update-version -- <X.Y.Z>
  python3 scripts/update_version.py <X.Y.Z>

共通ワークフローとの連携:
  PR に `/ai-bump patch|minor` とコメントすると、共通ワークフロー（gemini-ai-pr-fix）が
  ベースブランチのバージョンから新しいバージョンを決め、`npm run update-version -- <X.Y.Z>` を実行する。
  VS Code 拡張機能テンプレートの `scripts/update-version.js` と同じ呼び出し方に揃えている。

動作:
  - バージョンは X.Y.Z（ASCII 数字）で、Chrome の manifest の制約（各数値 0〜65535、すべて 0 は不可）を満たすこと。
  - すべての対象を読み込んで更新後の内容を作り、問題が 1 つでもあれば何も書き込まずに失敗する
    （一部のファイルだけが更新された状態を残さない）。
  - 対象ファイルは書式（インデント・改行コード・キー順）を保ったまま、バージョン部分だけを置き換える。
    JSON は置き換え後に解析し直し、対象のフィールド以外が変わっていないことを確認する。
  - 存在しない任意ファイルはスキップする。`required=True` の対象が無い・更新できない場合は失敗する。
  - 最後に `scripts/check_version.py` があれば実行し、整合性を検証する。
"""

from __future__ import annotations

import copy
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass

# ASCII 数字に限定する（\d は全角数字など Unicode の数字にも一致するため使わない）
SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
# Chrome の manifest の version は各数値 0〜65535、すべて 0 は不可
CHROME_VERSION_MAX = 65535


@dataclass
class JsonTarget:
    """トップレベルの "version" を持つ JSON ファイル。"""

    path: str
    required: bool = False
    # package-lock.json は packages[""].version も更新する
    lockfile: bool = False


@dataclass
class TextTarget:
    """テキスト中のバージョン表記。pattern は (前置部)(バージョン)(後置部) の 3 グループで書く。"""

    path: str
    pattern: str
    required: bool = False


# ---------------------------------------------------------------------------
# ★ プロジェクトごとに編集する箇所 ★
# 実際のファイル構成に合わせて追加・削除する（check_version.py の VERSION_SOURCES と揃える）。
# check_version.py が必須として検証するファイルは required=True にする。
# ---------------------------------------------------------------------------
JSON_TARGETS: list[JsonTarget] = [
    JsonTarget("package.json", required=True),
    JsonTarget("package-lock.json", required=True, lockfile=True),
    JsonTarget("projects/app/manifest.json", required=True),
    JsonTarget("projects/app/version.json", required=True),
]

TEXT_TARGETS: list[TextTarget] = [
    # README のバージョンバッジ（例: https://img.shields.io/badge/version-1.2.3-blue）。
    # check_version.py の README の検出パターンと揃える
    TextTarget("README.md", r"(img\.shields\.io/badge/version-)([0-9]+\.[0-9]+\.[0-9]+)(-)", required=True),
]


class UpdateError(Exception):
    """更新を中止すべき問題。"""


def validate_version(raw: str) -> str:
    version = raw.strip()
    if version[:1] in ("v", "V"):
        version = version[1:]
    match = SEMVER.match(version)
    if not match:
        raise UpdateError(f'バージョンの形式が不正です: "{raw}"（X.Y.Z の ASCII 数字。例: 1.4.0）')
    numbers = [int(n) for n in match.groups()]
    if any(n > CHROME_VERSION_MAX for n in numbers):
        raise UpdateError(f"各数値は {CHROME_VERSION_MAX} 以下にしてください（Chrome の制約）: {version}")
    if all(n == 0 for n in numbers):
        raise UpdateError(f"すべての数値が 0 のバージョンは使えません（Chrome の制約）: {version}")
    return version


def read_text(path: str) -> str:
    # newline="" で改行コード（LF / CRLF）を保つ
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def plan_json(target: JsonTarget, text: str, new_version: str) -> tuple[str, str]:
    """更新後の内容と旧バージョンを返す。対象フィールド以外が変わる場合は失敗する。"""
    data = json.loads(text)
    old = data.get("version")
    if not isinstance(old, str):
        raise UpdateError(f'{target.path} にトップレベルの "version" がありません。')
    expected = copy.deepcopy(data)
    expected["version"] = new_version
    count = 1
    root_package = data.get("packages", {}).get("") if target.lockfile else None
    if isinstance(root_package, dict) and "version" in root_package:
        if root_package["version"] != old:
            raise UpdateError(
                f'{target.path} の "version"（{old}）と packages[""].version（{root_package["version"]}）が'
                " 一致していません。npm install で lockfile を整えてから実行してください。"
            )
        expected["packages"][""]["version"] = new_version
        count = 2
    # `"version": "<old>"` の最初の出現（package-lock.json は root と packages[""] の 2 か所）を置き換える。
    # `"manifest_version"` などは直前が `"` でないため一致しない
    pattern = re.compile(r'("version"\s*:\s*")' + re.escape(old) + r'(")')
    updated, replaced = pattern.subn(lambda m: m.group(1) + new_version + m.group(2), text, count=count)
    # 置き換え後の内容が「対象フィールドだけを変えた JSON」と完全に一致することを確認する
    if replaced != count or json.loads(updated) != expected:
        raise UpdateError(f"{target.path} のバージョン表記を特定できませんでした（書式を確認してください）。")
    return updated, old


def plan_text(target: TextTarget, text: str, new_version: str) -> tuple[str, int]:
    updated, count = re.subn(target.pattern, lambda m: m.group(1) + new_version + m.group(3), text)
    return updated, count


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: npm run update-version -- <X.Y.Z>", file=sys.stderr)
        return 1

    errors: list[str] = []
    try:
        new_version = validate_version(argv[1])
    except UpdateError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # 1. すべての対象を読み込み、更新後の内容を作る（ここでは書き込まない）
    contents: dict[str, str] = {}  # パス → 更新後の内容（同じファイルへの複数の対象を順に適用する）
    originals: dict[str, str] = {}
    logs: list[str] = []

    def load(path: str) -> str:
        if path not in contents:
            originals[path] = read_text(path)
            contents[path] = originals[path]
        return contents[path]

    for target in JSON_TARGETS:
        if not os.path.exists(target.path):
            if target.required:
                errors.append(f"必須ファイルが見つかりません: {target.path}")
            continue
        try:
            contents[target.path], old = plan_json(target, load(target.path), new_version)
            logs.append(f"Updated {target.path}: {old} -> {new_version}")
        except (OSError, ValueError, UpdateError) as e:
            errors.append(f"{target.path}: {e}")

    for target in TEXT_TARGETS:
        if not os.path.exists(target.path):
            if target.required:
                errors.append(f"必須ファイルが見つかりません: {target.path}")
            continue
        try:
            contents[target.path], count = plan_text(target, load(target.path), new_version)
        except (OSError, UnicodeDecodeError) as e:
            errors.append(f"{target.path}: {e}")
            continue
        if count == 0:
            message = f"{target.path} にバージョン表記が見つかりません（pattern: {target.pattern}）"
            if target.required:
                errors.append(message)
            else:
                logs.append(f"Warning: {message}")
            continue
        logs.append(f"Updated {target.path}: {count} 箇所 -> {new_version}")

    if errors:
        for message in errors:
            print(f"Error: {message}", file=sys.stderr)
        print("どのファイルも変更していません。", file=sys.stderr)
        return 1

    # 2. 問題が無いことを確認してから、変更のあるファイルだけを書き込む
    for path, text in contents.items():
        if text != originals[path]:
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write(text)
    for line in logs:
        print(line)

    # 3. 整合性の検証（check_version.py があれば）
    if os.path.exists("scripts/check_version.py"):
        sys.stdout.flush()  # 子プロセスの出力より先に、更新結果のログを出す
        return subprocess.run([sys.executable, "scripts/check_version.py"], check=False).returncode
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

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
  - 対象ファイルは書式（インデント・改行コード・キー順）を保ったまま、バージョン部分だけを置き換える。
  - 存在しない任意ファイルはスキップする。`required=True` のファイルが無ければ失敗する。
  - 最後に `scripts/check_version.py` があれば実行し、整合性を検証する。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass

SEMVER = re.compile(r"^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$")


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
# ---------------------------------------------------------------------------
JSON_TARGETS: list[JsonTarget] = [
    JsonTarget("package.json", required=True),
    JsonTarget("package-lock.json", lockfile=True),
    JsonTarget("projects/app/manifest.json", required=True),
    JsonTarget("projects/app/version.json"),
]

TEXT_TARGETS: list[TextTarget] = [
    # README のバージョンバッジ（例: https://img.shields.io/badge/version-1.2.3-blue）
    TextTarget("README.md", r"(img\.shields\.io/badge/version-)(\d+\.\d+\.\d+)(-)"),
]


def read_text(path: str) -> str:
    # newline="" で改行コード（LF / CRLF）を保つ
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def write_text(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def update_json(target: JsonTarget, new_version: str) -> bool:
    text = read_text(target.path)
    data = json.loads(text)
    old = data.get("version")
    if not isinstance(old, str):
        raise ValueError(f'{target.path} にトップレベルの "version" がありません。')
    expected = 1
    if target.lockfile and isinstance(data.get("packages", {}).get(""), dict):
        expected = 2
    # `"version": "<old>"` の最初の出現（package-lock.json は root と packages[""] の 2 か所）を置き換える。
    # `"manifest_version"` などは直前が `"` でないため一致しない
    pattern = re.compile(r'("version"\s*:\s*")' + re.escape(old) + r'(")')
    updated, count = pattern.subn(lambda m: m.group(1) + new_version + m.group(2), text, count=expected)
    result = json.loads(updated)
    ok = count == expected and result.get("version") == new_version
    if target.lockfile and expected == 2:
        ok = ok and result["packages"][""].get("version") == new_version
    if not ok:
        raise ValueError(f"{target.path} のバージョン表記を特定できませんでした（書式を確認してください）。")
    if updated != text:
        write_text(target.path, updated)
    print(f"Updated {target.path}: {old} -> {new_version}")
    return True


def update_text(target: TextTarget, new_version: str) -> bool:
    text = read_text(target.path)
    updated, count = re.subn(target.pattern, lambda m: m.group(1) + new_version + m.group(3), text)
    if count == 0:
        message = f"{target.path} にバージョン表記が見つかりません（pattern: {target.pattern}）。"
        if target.required:
            raise ValueError(message)
        print(f"Warning: {message}")
        return False
    if updated != text:
        write_text(target.path, updated)
    print(f"Updated {target.path}: {count} 箇所 -> {new_version}")
    return True


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: npm run update-version -- <X.Y.Z>", file=sys.stderr)
        return 1
    new_version = argv[1].strip()
    if new_version[:1] in ("v", "V"):
        new_version = new_version[1:]
    if not SEMVER.match(new_version):
        print(f'Error: バージョンの形式が不正です: "{argv[1]}"（例: 1.4.0）', file=sys.stderr)
        return 1

    try:
        for target in JSON_TARGETS:
            if not os.path.exists(target.path):
                if target.required:
                    raise ValueError(f"必須ファイルが見つかりません: {target.path}")
                continue
            update_json(target, new_version)
        for target in TEXT_TARGETS:
            if not os.path.exists(target.path):
                if target.required:
                    raise ValueError(f"必須ファイルが見つかりません: {target.path}")
                continue
            update_text(target, new_version)
    except (OSError, ValueError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # 整合性の検証（check_version.py があれば）
    if os.path.exists("scripts/check_version.py"):
        sys.stdout.flush()  # 子プロセスの出力より先に、更新結果のログを出す
        return subprocess.run([sys.executable, "scripts/check_version.py"], check=False).returncode
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

import subprocess
import json
import re
import os
import sys
import argparse

def get_last_version_commit():
    try:
        # Get the hash of the last commit that modified projects/app/version.json
        cmd = ["git", "log", "-1", "--format=%H", "projects/app/version.json"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None

def get_commits_since(commit_hash):
    if not commit_hash:
        # If no last commit (initial), get all commits
        cmd = ["git", "log", "--format=%B", "-z"]
    else:
        cmd = ["git", "log", f"{commit_hash}..HEAD", "--format=%B", "-z"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        commits = result.stdout.split('\0')
        return [c.strip() for c in commits if c.strip()]
    except subprocess.CalledProcessError:
        return []

def determine_bump_type(commits):
    # Default to "patch" if any commit exists, to prevent forgetting version updates.
    # We will upgrade this to "minor" or "major" if specific commit types are found.
    bump = "patch"
    found_any = False

    for body in commits:
        found_any = True
        # Check for breaking change: "feat!:", "fix!:", or "BREAKING CHANGE" in body/footer
        if "BREAKING CHANGE" in body or re.search(r'^[a-zA-Z]+!:', body, re.MULTILINE):
            return "major"

        # Check for features
        if re.search(r'^feat(\(.*\))?:', body, re.MULTILINE):
            bump = "minor"

    if not found_any:
        return None

    return bump

def bump_version(current_version, bump_type):
    major, minor, patch = map(int, current_version.split('.'))
    if bump_type == "major":
        return f"{major + 1}.0.0"
    elif bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    elif bump_type == "patch":
        return f"{major}.{minor}.{patch + 1}"
    return current_version

def update_json_file(filepath, new_version):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    data['version'] = new_version
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print the new version without updating files")
    parser.add_argument("--type", choices=["major", "minor", "patch"], help="Force a specific bump type")
    args = parser.parse_args()

    last_commit = get_last_version_commit()
    commits = get_commits_since(last_commit)

    if args.type:
        bump_type = args.type
    elif not commits:
        print("No new commits found since last version update.")
        return
    else:
        bump_type = determine_bump_type(commits)

    if not bump_type:
        print("No relevant changes found for version bump.")
        return

    try:
        with open('projects/app/version.json', 'r', encoding='utf-8') as f:
            current_version = json.load(f).get('version')
    except Exception as e:
        print(f"Error reading projects/app/version.json: {e}")
        sys.exit(1)

    new_version = bump_version(current_version, bump_type)

    if args.dry_run:
        print(f"Bumping version from {current_version} to {new_version} ({bump_type}) (DRY RUN)")
        return

    print(f"Bumping version from {current_version} to {new_version} ({bump_type})")

    # 1. Update package.json and package-lock.json using npm version
    try:
        subprocess.run(["npm", "version", new_version, "--no-git-tag-version"], check=True)
        print("Updated package.json and package-lock.json using npm version")
    except subprocess.CalledProcessError:
        print("Warning: npm version failed. Falling back to manual update.")
        update_json_file('package.json', new_version)
        if os.path.exists('package-lock.json'):
            update_json_file('package-lock.json', new_version)

    # 2. Update other files
    files_to_update = [
        'projects/app/version.json',
        'projects/app/manifest.json'
    ]

    for filepath in files_to_update:
        if os.path.exists(filepath):
            update_json_file(filepath, new_version)
            print(f"Updated {filepath}")
        else:
            print(f"Warning: {filepath} not found.")

    # 3. Special handling for README.md version badge
    readme_path = 'README.md'
    if os.path.exists(readme_path):
        with open(readme_path, 'r', encoding='utf-8') as f:
            content = f.read()

        new_content = re.sub(
            r'(!\[version\]\(https://img\.shields\.io/badge/version-)[0-9.]+(-blue\))',
            r'\g<1>' + new_version + r'\g<2>',
            content
        )

        if content != new_content:
            with open(readme_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated version badge in {readme_path}")

if __name__ == "__main__":
    main()
